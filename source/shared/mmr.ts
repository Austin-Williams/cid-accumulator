import { CID } from "multiformats/cid"
import { encodeBlock } from "./codec.ts"

export class MerkleMountainRange {
	private peaks: CID[] = []
	private leafCount = 0

	constructor() {}

	async addLeafWithTrail(
		blockData: Uint8Array,
		expectedLeafIndex?: number,
		expectedNewRootCID?: string,
	): Promise<{
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

		const { cid: leafCID } = await encodeBlock(blockData)

		let newPeak = leafCID
		let height = 0

		const combineResultsCIDs: string[] = []
		const combineResultsData: Uint8Array[] = []
		const rightInputsCIDs: string[] = []

		while ((this.leafCount >> height) & 1) {
			const left = this.peaks.pop()
			if (!left) throw new Error("MMR structure error: no peak to merge")

			const { cid: merged, bytes } = await encodeBlock({ L: left, R: newPeak })

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
			leafCID: leafCID.toString(),
			rootCID: rootCID.toString(),
			combineResultsCIDs: combineResultsCIDs,
			combineResultsData: combineResultsData,
			rightInputsCIDs: rightInputsCIDs,
			peakBaggingCIDs: peakBaggingInfo.cids,
			peakBaggingData: peakBaggingInfo.data,
		}
	}

	async rootCIDWithTrail(): Promise<{ root: CID; cids: string[]; data: Uint8Array[] }> {
		const cids: string[] = []
		const data: Uint8Array[] = []

		if (this.peaks.length === 0) {
			const empty = CID.parse("bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku")
			return { root: empty, cids: [], data: [] }
		}

		if (this.peaks.length === 1) {
			return { root: this.peaks[0], cids: [], data: [] }
		}

		let current = this.peaks[0]
		for (let i = 1; i < this.peaks.length; i++) {
			const { cid, bytes } = await encodeBlock({ L: current, R: this.peaks[i] })
			cids.push(cid.toString())
			data.push(bytes)
			current = cid
		}

		return { root: current, cids, data }
	}

	async rootCID(): Promise<CID> {
		const result = await this.rootCIDWithTrail()
		return result.root
	}
}
