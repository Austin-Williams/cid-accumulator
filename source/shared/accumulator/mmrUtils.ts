import { CID } from "multiformats/cid"
import { encodeBlock } from "../codec.ts"
import type { PeakWithHeight } from "../types.ts"
import { EMPTY_CID } from "../constants.ts"

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

export async function computePreviousRootCIDAndPeaksWithHeights(
	currentPeaksWithHeights: PeakWithHeight[],
	newData: Uint8Array,
	leftInputsDuringLatestMerge: CID[],
): Promise<{ previousRootCID: CID; previousPeaksWithHeights: PeakWithHeight[] }> {
	// Defensive copy
	let peaks: PeakWithHeight[] = currentPeaksWithHeights.map((p) => ({ cid: p.cid, height: p.height }))

	if (currentPeaksWithHeights.length == 0) return { previousRootCID: EMPTY_CID, previousPeaksWithHeights: [] } // if there are no peaks now, there never were

	if (leftInputsDuringLatestMerge.length === 0) {
		// No merges, just remove the peak with height 0
		const previousPeaksWithHeights = currentPeaksWithHeights.filter((p) => p.height !== 0)
		const previousRootCID: CID = await getRootCIDFromPeaks(previousPeaksWithHeights.map((p) => p.cid))
		return { previousRootCID, previousPeaksWithHeights }
	}

	// Unmerge for each left input (reverse order)
	let reconstructedPeaks: PeakWithHeight[] = [...peaks]
	for (let i = leftInputsDuringLatestMerge.length - 1; i >= 0; i--) {
		const mergedPeak = reconstructedPeaks.pop()
		if (!mergedPeak) throw new Error("No mergedPeak to unmerge")
		const childHeight = mergedPeak.height - 1
		// Push left and right children as new peaks
		reconstructedPeaks.push({ cid: leftInputsDuringLatestMerge[i], height: childHeight })
		reconstructedPeaks.push({ cid: mergedPeak.cid, height: childHeight })
	}

	// Remove the new leaf peak at height 0 (not present in previous state)
	const { cid: newLeafCID } = await encodeBlock(newData)
	reconstructedPeaks = reconstructedPeaks.filter((p) => !(p.height === 0 && p.cid.toString() === newLeafCID.toString()))

	const previousRootCID: CID = await getRootCIDFromPeaks(reconstructedPeaks.map((p) => p.cid))

	return { previousRootCID, previousPeaksWithHeights: reconstructedPeaks }
}

