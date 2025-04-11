import * as dagCbor from "@ipld/dag-cbor"
import { CID } from "multiformats/cid"
import { sha256 } from "multiformats/hashes/sha2"
import type { Blockstore } from "interface-blockstore"

export type IpldNode = Uint8Array | CID | { L: CID; R: CID }

function isIpldLink(obj: unknown): obj is CID {
	return obj instanceof CID
}

function isInternalNode(obj: unknown): obj is { L: CID; R: CID } {
	return (
		typeof obj === "object" &&
		obj !== null &&
		"L" in obj &&
		"R" in obj &&
		(obj as any).L instanceof CID &&
		(obj as any).R instanceof CID
	)
}

export async function resolveMerkleTree(cid: CID, blockstore: Blockstore): Promise<Uint8Array[]> {
	const raw = await blockstore.get(cid)
	const node: IpldNode = dagCbor.decode(raw)

	if (node instanceof Uint8Array) {
		return [node]
	} else if (isIpldLink(node)) {
		return await resolveMerkleTree(node, blockstore)
	} else if (isInternalNode(node)) {
		const L = await resolveMerkleTree(node.L, blockstore)
		const R = await resolveMerkleTree(node.R, blockstore)
		return [...L, ...R]
	} else {
		throw new Error("Unexpected node structure")
	}
}

export class MerkleMountainRange {
	private peaks: CID[] = []
	private encodeBlock = async (value: unknown): Promise<{ cid: CID; bytes: Uint8Array }> => {
		const encoded = dagCbor.encode(value)
		const hash = await sha256.digest(encoded)
		const cid = CID.createV1(dagCbor.code, hash)
		return { cid, bytes: encoded }
	}

	constructor(private blockstore: Blockstore) {}

	async addLeaves(blockData: Uint8Array[]) {
		let index = 0

		while (index < blockData.length) {
			let size = 1
			while (index + size * 2 <= blockData.length) {
				size *= 2
			}

			const chunk = blockData.slice(index, index + size)
			const peak = await this.buildMerkleTree(chunk)
			this.peaks.push(peak)
			index += size
		}
	}

	async rootCID(): Promise<CID> {
		if (this.peaks.length === 0) {
			throw new Error("MMR has no peaks")
		}

		if (this.peaks.length === 1) {
			return this.peaks[0]
		}

		let current = this.peaks[0]
		for (let i = 1; i < this.peaks.length; i++) {
			const { cid, bytes } = await this.encodeBlock({ L: current, R: this.peaks[i] })
			await this.blockstore.put(cid, bytes)
			current = cid
		}

		return current
	}

	private async buildMerkleTree(blockData: Uint8Array[]): Promise<CID> {
		let layer: CID[] = []
		for (const data of blockData) {
			const { cid, bytes } = await this.encodeBlock(data)
			await this.blockstore.put(cid, bytes)
			layer.push(cid)
		}

		while (layer.length > 1) {
			const nextLayer: CID[] = []
			for (let i = 0; i < layer.length; i += 2) {
				if (i + 1 < layer.length) {
					const { cid, bytes } = await this.encodeBlock({ L: layer[i], R: layer[i + 1] })
					await this.blockstore.put(cid, bytes)
					nextLayer.push(cid)
				} else {
					nextLayer.push(layer[i])
				}
			}
			layer = nextLayer
		}

		return layer[0]
	}
}
