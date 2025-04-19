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
export async function computePreviousRootCID(
	currentPeaks: CID[],
	newData: Uint8Array,
	leftInputs: CID[],
): Promise<{ previousRootCID: CID; previousPeaks: CID[]; reconstructedParents: CID[] }> {
	let peaks: CID[]

	if (leftInputs.length === 0) {
		// No merges: last peak was just appended. Remove it to get previous peaks.

		peaks = currentPeaks.slice(0, -1)

		return { previousRootCID: await bagPeaks(peaks), previousPeaks: peaks, reconstructedParents: [] }
	} else {
		// General case: reverse merges using only leftInputs[] and newData

		peaks = currentPeaks.slice()

		const reconstructedParents: CID[] = []
		let right: CID = await hashLeaf(newData)
		for (let i = leftInputs.length - 1; i >= 0; --i) {
			const left = leftInputs[i]
			// Reconstruct parent (for chaining/backward walk)
			const merged = await hashNode(left, right)
			reconstructedParents.unshift(merged)

			// Always operate on the last peak (the root after all merges)
			if (peaks.length === 0) {
				throw new Error("No peaks left to unmerge during reversal")
			}

			peaks.pop() // Remove the merged parent (root)
			peaks.push(left, right)

			right = merged // For next iteration, right is the parent we just reconstructed
		}
		// Remove the new leaf CID from peaks
		const newLeafCID = await hashLeaf(newData)
		peaks = peaks.filter((c) => c.toString() !== newLeafCID.toString())
		// Remove all reconstructed parents (none should be peaks in previous state)
		if (reconstructedParents.length > 0) {
			const parentSet = new Set(reconstructedParents.map((c) => c.toString()))
			peaks = peaks.filter((c) => !parentSet.has(c.toString()))
		}

		// Output reconstructedParents for chaining
		return { previousRootCID: await bagPeaks(peaks), previousPeaks: peaks, reconstructedParents }
	}
}

// Helper to bag peaks left-to-right
async function bagPeaks(peaks: CID[]): Promise<CID> {
	if (peaks.length === 0) throw new Error("No peaks to bag")
	let root = peaks[0]
	for (let i = 1; i < peaks.length; ++i) {
		root = await hashNode(root, peaks[i])
	}
	return root
}

// Helper to hash a leaf (encode as dag-cbor, then hash, return CID)
async function hashLeaf(data: Uint8Array): Promise<CID> {
	const encoded = dagCbor.encode(data)
	const digest = await sha256.digest(encoded)
	return CID.create(1, dagCbor.code, digest)
}

// Helper to hash an internal node (encode {L, R}, then hash, return CID)
async function hashNode(left: CID, right: CID): Promise<CID> {
	const encoded = dagCbor.encode({ L: left, R: right })
	const digest = await sha256.digest(encoded)
	return CID.create(1, dagCbor.code, digest)
}
