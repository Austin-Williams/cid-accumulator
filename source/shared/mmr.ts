import { CID } from "multiformats/cid"
import { encodeBlock } from "./codec.ts"

export class MerkleMountainRange {
	public peaks: CID[] = []
	public leafCount = 0

	constructor() {}

	/**
	 * Adds a new leaf to the Merkle Mountain Range (MMR) and computes all intermediate nodes.
	 * IT DOES NOT STORE THE RESULT IN THE DB, because the MMR is not concerned with the DB
	 * @param blockData - The raw data for the new leaf node to be added.
	 * @param expectedLeafIndex - (Optional) If provided, throws if the new leaf index does not match this value.
	 * @param expectedNewRootCID - (Optional) If provided, throws if the resulting root CID does not match this value after insertion.
	 * @returns An object containing:
	 *   - leafCID: The CID of the newly added leaf.
	 *   - rootCID: The new root CID after insertion.
	 *   - combineResultsCIDs: CIDs of all internal nodes combined during this insertion.
	 *   - combineResultsData: The raw data of all combined internal nodes.
	 *   - rightInputsCIDs: CIDs of right-side inputs used during peak bagging.
	 *   - peakBaggingCIDs: CIDs of all peaks bagged to compute the new root.
	 *   - peakBaggingData: The raw data of all peaks bagged to compute the new root.
	 */
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
		leftInputsCIDs: string[]
		peakBaggingCIDs: string[]
		peakBaggingData: Uint8Array[]
		trail: { cid: CID; data: Uint8Array }[]
	}> {
		if (expectedLeafIndex !== undefined && this.leafCount !== expectedLeafIndex) {
			throw new Error(`Expected leafIndex ${this.leafCount} but got ${expectedLeafIndex}`)
		}
		const trail: { cid: CID; data: Uint8Array }[] = []

		const { cid: leafCID, bytes: leafData } = await encodeBlock(blockData)
		trail.push({ cid: leafCID, data: leafData })

		let newPeak = leafCID
		let height = 0

		const combineResultsCIDs: string[] = []
		const combineResultsData: Uint8Array[] = []
		const rightInputsCIDs: string[] = []
		const leftInputsCIDs: string[] = []

		while ((this.leafCount >> height) & 1) {
			const left = this.peaks.pop()
			if (!left) throw new Error("MMR structure error: no peak to merge")

			const { cid: merged, bytes } = await encodeBlock({ L: left, R: newPeak })
			trail.push({ cid: merged, data: bytes })

			combineResultsCIDs.push(merged.toString())
			combineResultsData.push(bytes)
			rightInputsCIDs.push(newPeak.toString())
			leftInputsCIDs.push(left.toString())

			newPeak = merged
			height++
		}

		this.peaks.push(newPeak)
		this.leafCount++

		const peakBaggingInfo = await this.rootCIDWithTrail()
		trail.push(...peakBaggingInfo.trail)

		const rootCID = peakBaggingInfo.root

		if (expectedNewRootCID !== undefined && peakBaggingInfo.root.toString() !== expectedNewRootCID) {
			throw new Error(`Expected new root CID ${this.leafCount} but got ${expectedNewRootCID}`)
		}

		return {
			leafCID: leafCID.toString(),
			rootCID: rootCID.toString(),
			combineResultsCIDs: combineResultsCIDs,
			combineResultsData: combineResultsData,
			rightInputsCIDs: rightInputsCIDs,
			leftInputsCIDs: leftInputsCIDs,
			peakBaggingCIDs: peakBaggingInfo.cids,
			peakBaggingData: peakBaggingInfo.data,
			trail: trail,
		}
	}

	async rootCIDWithTrail(): Promise<{
		root: CID
		cids: string[]
		data: Uint8Array[]
		trail: { cid: CID; data: Uint8Array }[]
	}> {
		const cids: string[] = []
		const data: Uint8Array[] = []
		const trail: { cid: CID; data: Uint8Array }[] = []

		if (this.peaks.length === 0) {
			const empty = CID.parse("bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku")
			return { root: empty, cids: [], data: [], trail: [] }
		}

		if (this.peaks.length === 1) {
			return { root: this.peaks[0], cids: [], data: [], trail: [] }
		}

		let current = this.peaks[0]
		for (let i = 1; i < this.peaks.length; i++) {
			const { cid, bytes } = await encodeBlock({ L: current, R: this.peaks[i] })
			trail.push({ cid: cid, data: bytes })
			cids.push(cid.toString())
			data.push(bytes)
			current = cid
		}

		return { root: current, cids, data, trail }
	}

	async rootCID(): Promise<CID> {
		const result = await this.rootCIDWithTrail()
		return result.root
	}

	async rootCIDAsBase32(): Promise<string> {
		const cid = await this.rootCID()
		return cid.toString()
	}
}

/**
 * Computes the root CID from an array of peak CIDs, left-to-right bagging (canonical MMR logic).
 * @param peaks Array of CIDs (left-to-right order)
 * @returns The root CID (or the zero CID if peaks is empty)
 */
export async function getRootCIDFromPeaks(peaks: CID[]): Promise<CID> {
	if (peaks.length === 0) {
		return CID.parse("bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku")
	}
	if (peaks.length === 1) {
		return peaks[0]
	}
	let current = peaks[0]
	for (let i = 1; i < peaks.length; i++) {
		const { cid } = await encodeBlock({ L: current, R: peaks[i] })
		current = cid
	}
	return current
}
