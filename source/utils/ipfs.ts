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
	private leafCount = 0

	constructor() {}

	private encodeBlock = async (value: unknown): Promise<{ cid: CID; bytes: Uint8Array }> => {
		const encoded = dagCbor.encode(value)
		const hash = await sha256.digest(encoded)
		const cid = CID.createV1(dagCbor.code, hash)
		return { cid, bytes: encoded }
	}

	async addLeafWithTrail(blockData: Uint8Array, expectedLeafIndex?: number, expectedNewRootCID?: string): Promise<{
		leafCID: string
		rootCID: string
		combineResultsCIDs: string[]
		combineResultsData: Uint8Array[]
		rightInputsCIDs: string[]
		peakBaggingCIDs: string[]
		peakBaggingData: Uint8Array[]
	}> {
		if (expectedLeafIndex !== undefined && this.leafCount !== expectedLeafIndex) {
			throw new Error(`Expected leafIndex ${this.leafCount} but got ${expectedLeafIndex}`)
		}

		const { cid: leafCID, } = await this.encodeBlock(blockData)

		let newPeak = leafCID
		let height = 0

		const combineResultsCIDs: string[] = []
		const combineResultsData: Uint8Array[] = []
		const rightInputsCIDs: string[] = []

		while ((this.leafCount >> height) & 1) {
			const left = this.peaks.pop()
			if (!left) throw new Error('MMR structure error: no peak to merge')

			const { cid: merged, bytes } = await this.encodeBlock({ L: left, R: newPeak })

			combineResultsCIDs.push(merged.toString())
			combineResultsData.push(bytes)
			rightInputsCIDs.push(newPeak.toString())
			
			newPeak = merged
			height++
		}

		this.peaks.push(newPeak)
		this.leafCount++

		const peakBaggingInfo = await this.rootCIDWithTrail()

		const rootCID = peakBaggingInfo

		if (expectedNewRootCID !== undefined && peakBaggingInfo.root.toString() !== expectedNewRootCID) {
			throw new Error(`Expected new root CID ${this.leafCount} but got ${expectedNewRootCID}`)
		}

		return { 
			leafCID:leafCID.toString(),
			rootCID: rootCID.toString(),
			combineResultsCIDs: combineResultsCIDs,
			combineResultsData: combineResultsData,
			rightInputsCIDs: rightInputsCIDs,
			peakBaggingCIDs: peakBaggingInfo.cids,
			peakBaggingData: peakBaggingInfo.data
		}
	}

	private async _addLeaf(blockData:Uint8Array) {
		const { cid, } = await this.encodeBlock(blockData)
		let newPeak = cid
		let height = 0

		// While the number of trailing 1s in leafCount allows merging
		while ((this.leafCount >> height) & 1) {
			const left = this.peaks.pop()
			if (!left) throw new Error('MMR structure error: no peak to merge')

			const { cid: merged, } = await this.encodeBlock({ L: left, R: newPeak })
			newPeak = merged
			height++
		}

		this.peaks.push(newPeak)
		this.leafCount++
	}

	async addLeaf(blockData:Uint8Array, leafIndexHint?: number): Promise<CID> {
		if (leafIndexHint) { // optional check to ensure leaves are being inserted in the proper order
			if (this.leafCount !== leafIndexHint) {
				throw new Error(`Expected leaf with index ${this.leafCount} but got leafIndexHint ${leafIndexHint}`)
			}
		}
		await this._addLeaf(blockData)
		return await this.rootCID()
	}

	async addLeaves(blockData: Uint8Array[]): Promise<CID> {
		for (const leaf of blockData) {
			await this._addLeaf(leaf)
		}
		return await this.rootCID()
	}

	async rootCIDWithTrail(): Promise<{ root: CID; cids: string[]; data: Uint8Array[] }> {
		const cids: string[] = []
		const data: Uint8Array[] = []

		if (this.peaks.length === 0) {
			const empty = CID.parse('bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku')
			return { root: empty, cids: [], data: [] }
		}

		if (this.peaks.length === 1) {
			return { root: this.peaks[0], cids: [], data: [] }
		}

		let current = this.peaks[0]
		for (let i = 1; i < this.peaks.length; i++) {
			const { cid, bytes } = await this.encodeBlock({ L: current, R: this.peaks[i] })
			cids.push(cid.toString())
			data.push(bytes)
			current = cid
		}

		return { root: current, cids, data }
	}
	
	async rootCID(): Promise<CID> {
		if (this.peaks.length === 0) {
			return CID.parse('bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku') // canonical empty block
		}

		if (this.peaks.length === 1) {
			return this.peaks[0]
		}

		let current = this.peaks[0]
		for (let i = 1; i < this.peaks.length; i++) {
			const { cid, } = await this.encodeBlock({ L: current, R: this.peaks[i] })
			current = cid
		}

		return current
	}
}
