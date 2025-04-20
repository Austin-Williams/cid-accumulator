import { CID } from "multiformats/cid"
import * as dagCbor from "@ipld/dag-cbor"
import { sha256 } from "multiformats/hashes/sha2"

/**
 * Computes the previous root CID and previous peaks of the accumulator given:
 * @param currentPeaksWithHeights - Array of {cid, height} for current peaks
 * @param newData - The data of the inserted leaf (Uint8Array) whose merging created the currentPeaks
 * @param leftInputs - Array of CIDs, the left input to each merge (from bottom to top)
 * @param currentPeakHeights - Array of heights for the current peaks (should match currentPeaksWithHeights)
 * @returns An object with previousRootCID, previousPeaksWithHeights, and reconstructedParents (for chaining)
 */
import type { PeakWithHeight } from "./types.ts"

export async function computePreviousRootCID(
	currentPeaksWithHeights: PeakWithHeight[],
	newData: Uint8Array,
	leftInputs: CID[],
): Promise<{
	previousRootCID: CID
	previousPeaksWithHeights: PeakWithHeight[]
	reconstructedParents: CID[]
}> {
	let peaks: PeakWithHeight[] = currentPeaksWithHeights.map((p) => ({
		cid: p.cid as CID,
		height: p.height,
	}))

	if (leftInputs.length === 0) {
		// Remove the new leaf CID from peaks
		const newLeafCID = await hashLeaf(newData)
		peaks = peaks.filter((p) => p.cid.toString() !== newLeafCID.toString())
		return {
			previousRootCID: await bagPeaksWithHeights(peaks),
			previousPeaksWithHeights: peaks,
			reconstructedParents: [],
		}
	}

	const reconstructedParents: CID[] = []
	let peaksCopy = [...peaks]
	for (let i = leftInputs.length - 1; i >= 0; i--) {
		const right = peaksCopy.shift()
		const left = leftInputs[i]
		const merged = await hashNode(left as CID, right!.cid as CID)
		reconstructedParents.unshift(merged)
		if (peaksCopy.length === 0) throw new Error("No peaks left to unmerge during reversal")
		peaksCopy = peaksCopy.slice(1)
	}
	peaks = peaksCopy
	return {
		previousRootCID: await bagPeaksWithHeights(peaks),
		previousPeaksWithHeights: peaks,
		reconstructedParents,
	}
}

// Helper to bag peaks left-to-right (using PeakWithHeight[])
export async function bagPeaksWithHeights(peaks: PeakWithHeight[]): Promise<CID> {
	if (peaks.length === 0) throw new Error("No peaks to bag")
	let root = peaks[0].cid as CID
	for (let i = 1; i < peaks.length; ++i) {
		root = await hashNode(root, peaks[i].cid as CID)
	}
	return root as CID
}

// Helper to hash a leaf (encode as dag-cbor, then hash, return CID)
export async function hashLeaf(data: Uint8Array): Promise<CID> {
	const encoded = dagCbor.encode(data)
	const digest = await sha256.digest(encoded)
	return CID.create(1, dagCbor.code, digest) as CID
}

// Helper to hash an internal node (encode {L, R}, then hash, return CID)
export async function hashNode(left: CID, right: CID): Promise<CID> {
	const encoded = dagCbor.encode({ L: left, R: right })
	const digest = await sha256.digest(encoded)
	return CID.create(1, dagCbor.code, digest) as CID
}
