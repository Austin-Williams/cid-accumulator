import { CID } from "multiformats/cid"
import * as dagCbor from "@ipld/dag-cbor"
import { sha256 } from "multiformats/hashes/sha2"

/**
 * Computes the previous root CID and previous peaks of the accumulator given:

 * @param currentPeaks - The current peaks (array of CIDs)
 * @param newData - The data of the inserted leaf (Uint8Array) whose merging created the currentPeaks
 * @param leftInputs - Array of CIDs, the left input to each merge (from bottom to top)
 * @returns An object with previousRootCID, previousPeaks, and reconstructedParents (for chaining)
 */
// Updated: Track both CID and height for each peak
export interface PeakWithHeight {
	cid: CID<unknown, 113, 18, 1>
	height: number
}

/**
 * Computes the previous root CID and previous peaks of the accumulator given:
 * @param currentPeaksWithHeights - Array of {cid, height} for current peaks
 * @param newData - The data of the inserted leaf (Uint8Array) whose merging created the currentPeaks
 * @param leftInputs - Array of CIDs, the left input to each merge (from bottom to top)
 * @param currentPeakHeights - Array of heights for the current peaks (should match currentPeaksWithHeights)
 * @returns An object with previousRootCID, previousPeaksWithHeights, and reconstructedParents (for chaining)
 */
export async function computePreviousRootCID(
	currentPeaksWithHeights: PeakWithHeight[],
	newData: Uint8Array,
	leftInputs: CID[],
): Promise<{
	previousRootCID: CID<unknown, 113, 18, 1>
	previousPeaksWithHeights: PeakWithHeight[]
	reconstructedParents: CID<unknown, 113, 18, 1>[]
}> {
	let peaks: PeakWithHeight[] = currentPeaksWithHeights.map((p) => ({
		cid: p.cid as CID<unknown, 113, 18, 1>,
		height: p.height,
	}))

	if (leftInputs.length === 0) {
		// No merges: last peak was just appended. Remove it to get previous peaks.
		peaks = peaks.slice(0, -1)
		return {
			previousRootCID: (await bagPeaksWithHeights(peaks)) as CID<unknown, 113, 18, 1>,
			previousPeaksWithHeights: peaks,
			reconstructedParents: [],
		}
	} else {
		// General case: reverse merges using only leftInputs[] and newData
		const reconstructedParents: CID<unknown, 113, 18, 1>[] = []
		let right: PeakWithHeight = { cid: (await hashLeaf(newData)) as CID<unknown, 113, 18, 1>, height: 0 }
		for (let i = leftInputs.length - 1; i >= 0; --i) {
			const left = leftInputs[i]
			// The height of the merged node is one higher than its children
			const mergedHeight = right.height + 1
			const merged = (await hashNode(left as CID<unknown, 113, 18, 1>, right.cid as CID<unknown, 113, 18, 1>)) as CID<
				unknown,
				113,
				18,
				1
			>
			reconstructedParents.unshift(merged)
			// Remove the merged parent (root) from peaks
			if (peaks.length === 0) throw new Error("No peaks left to unmerge during reversal")
			peaks.pop()
			// Push back left and right children with correct heights
			peaks.push({ cid: left as CID<unknown, 113, 18, 1>, height: right.height }, right)
			right = { cid: merged as CID<unknown, 113, 18, 1>, height: mergedHeight }
		}
		// Remove the new leaf CID from peaks
		const newLeafCID = (await hashLeaf(newData)) as CID<unknown, 113, 18, 1>
		peaks = peaks.filter((p) => p.cid.toString() !== newLeafCID.toString())
		// Remove all reconstructed parents (none should be peaks in previous state)
		if (reconstructedParents.length > 0) {
			const parentSet = new Set(reconstructedParents.map((c) => c.toString()))
			peaks = peaks.filter((p) => !parentSet.has(p.cid.toString()))
		}
		return {
			previousRootCID: (await bagPeaksWithHeights(peaks)) as CID<unknown, 113, 18, 1>,
			previousPeaksWithHeights: peaks,
			reconstructedParents,
		}
	}
}

// Helper to bag peaks left-to-right (using PeakWithHeight[])
async function bagPeaksWithHeights(peaks: PeakWithHeight[]): Promise<CID<unknown, 113, 18, 1>> {
	if (peaks.length === 0) throw new Error("No peaks to bag")
	let root = peaks[0].cid as CID<unknown, 113, 18, 1>
	for (let i = 1; i < peaks.length; ++i) {
		root = await hashNode(root, peaks[i].cid)
	}
	return root
}

// Helper to hash a leaf (encode as dag-cbor, then hash, return CID)
async function hashLeaf(data: Uint8Array): Promise<CID<unknown, 113, 18, 1>> {
	const encoded = dagCbor.encode(data)
	const digest = await sha256.digest(encoded)
	return CID.create(1, dagCbor.code, digest) as CID<unknown, 113, 18, 1>
}

// Helper to hash an internal node (encode {L, R}, then hash, return CID)
async function hashNode(
	left: CID<unknown, 113, 18, 1>,
	right: CID<unknown, 113, 18, 1>,
): Promise<CID<unknown, 113, 18, 1>> {
	const encoded = dagCbor.encode({ L: left, R: right })
	const digest = await sha256.digest(encoded)
	return CID.create(1, dagCbor.code, digest) as CID<unknown, 113, 18, 1>
}
