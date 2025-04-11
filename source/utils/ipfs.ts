import * as dagCbor from "@ipld/dag-cbor"
import { CID } from "multiformats/cid"
import { sha256 } from "multiformats/hashes/sha2"
import type { Blockstore } from "interface-blockstore"

export type IpldNode = string | CID | { left: CID; right: CID }

function isIpldLink(obj: unknown): obj is CID {
	return obj instanceof CID
}

function isInternalNode(obj: unknown): obj is { left: CID; right: CID } {
	return (
		typeof obj === "object" &&
		obj !== null &&
		"left" in obj &&
		"right" in obj &&
		(obj as any).left instanceof CID &&
		(obj as any).right instanceof CID
	)
}

export async function resolveMerkleTree(cid: CID, blockstore: Blockstore): Promise<string[]> {
	const raw = await blockstore.get(cid)
	const node: IpldNode = dagCbor.decode(raw)

	if (typeof node === "string") {
		return [node]
	} else if (isIpldLink(node)) {
		return await resolveMerkleTree(node, blockstore)
	} else if (isInternalNode(node)) {
		const left = await resolveMerkleTree(node.left, blockstore)
		const right = await resolveMerkleTree(node.right, blockstore)
		return [...left, ...right]
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

	async addLeaves(blockData: string[]) {
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
			const { cid, bytes } = await this.encodeBlock({ left: current, right: this.peaks[i] })
			await this.blockstore.put(cid, bytes)
			current = cid
		}

		return current
	}

	private async buildMerkleTree(blockData: string[]): Promise<CID> {
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
					const { cid, bytes } = await this.encodeBlock({ left: layer[i], right: layer[i + 1] })
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
