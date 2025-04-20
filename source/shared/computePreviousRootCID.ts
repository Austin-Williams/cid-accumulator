import { CID } from "multiformats/cid"
import {getRootCIDFromPeaks} from "./mmr.ts"
import type { PeakWithHeight } from "./types.ts"
import {EMPTY_CID} from "./constants.ts"

export async function computePreviousRootCIDAndPeaksWithHeights(
	currentPeaksWithHeights: PeakWithHeight[],
	newData: Uint8Array,
	leftInputsDuringLatestMerge: CID[]
): Promise<{ previousRootCID: CID; previousPeaksWithHeights: PeakWithHeight[] }> {
	// Defensive copy
	let peaks: PeakWithHeight[] = currentPeaksWithHeights.map(p => ({ cid: p.cid, height: p.height }));

	if (currentPeaksWithHeights.length == 0) return { previousRootCID: EMPTY_CID, previousPeaksWithHeights: [] } // if there are no peaks now, there never were

	if (leftInputsDuringLatestMerge.length === 0) {
		// No merges, just remove the peak with height 0
		const previousPeaksWithHeights = currentPeaksWithHeights.filter(p => p.height !== 0)
		const previousRootCID: CID = await getRootCIDFromPeaks(previousPeaksWithHeights.map(p => p.cid))
		return { previousRootCID, previousPeaksWithHeights }
	}

	// Unmerge for each left input (reverse order)
	let reconstructedPeaks: PeakWithHeight[] = [...peaks];
	for (let i = leftInputsDuringLatestMerge.length - 1; i >= 0; i--) {
		const mergedPeak = reconstructedPeaks.pop();
		if (!mergedPeak) throw new Error("No mergedPeak to unmerge");
		const childHeight = mergedPeak.height - 1;
		// Push left and right children as new peaks
		reconstructedPeaks.push({ cid: leftInputsDuringLatestMerge[i], height: childHeight });
		reconstructedPeaks.push({ cid: mergedPeak.cid, height: childHeight });
	}

	// Remove the new leaf peak at height 0 (not present in previous state)
	const { cid: newLeafCID } = await (await import("./codec.ts")).encodeBlock(newData);
	reconstructedPeaks = reconstructedPeaks.filter(
		(p) => !(p.height === 0 && p.cid.toString() === newLeafCID.toString())
	)

	const previousRootCID: CID = await getRootCIDFromPeaks(reconstructedPeaks.map(p => p.cid))

	return {previousRootCID, previousPeaksWithHeights: reconstructedPeaks}
}
