import { CID } from "multiformats/cid"
import * as dagCbor from "@ipld/dag-cbor"
import { sha256 } from "multiformats/hashes/sha2"

/**
 * Computes the previous root CID and previous peaks of the accumulator given:
 *   - the current root CID,
 *   - the current peaks (as CIDs),
 *   - the newData inserted,
 *   - leftInputs[]: the left peak for each merge (from bottom to top)
 *
 * @param currentRootCID - The current root CID (as a string or CID object)
 * @param currentPeaks - The current peaks (array of CIDs)
 * @param newData - The data of the inserted leaf (Uint8Array)
 * @param leftInputs - Array of CIDs, the left input to each merge (from bottom to top)
 * @returns An object with previousRootCID, previousPeaks, and reconstructedParents (for chaining)
 */
export async function computePreviousRootCID(
  currentRootCID: CID | string,
  currentPeaks: CID[],
  newData: Uint8Array,
  leftInputs: CID[],
): Promise<{ previousRootCID: CID, previousPeaks: CID[], reconstructedParents: CID[] }> {
  console.log("[computePreviousRootCID] ENTER");
  console.log("[computePreviousRootCID] currentRootCID:", currentRootCID.toString());
  console.log("[computePreviousRootCID] currentPeaks:", currentPeaks.map(c => c.toString()));
  console.log("[computePreviousRootCID] newData:", newData);
  console.log("[computePreviousRootCID] leftInputs:", leftInputs.map(c => c.toString()));

  let peaks: CID[];

  if (leftInputs.length === 0) {
    // No merges: last peak was just appended. Remove it to get previous peaks.
    console.log("[computePreviousRootCID] Special case: No merges (leftInputs.length === 0)");
    peaks = currentPeaks.slice(0, -1);
    console.log("[computePreviousRootCID] previousPeaks (after pop):", peaks.map(c => c.toString()));
    return { previousRootCID: await bagPeaks(peaks), previousPeaks: peaks, reconstructedParents: [] };
  } else {
    // General case: reverse merges using only leftInputs[] and newData
    console.log("[computePreviousRootCID] General case: Reversing merges with leftInputs[]");
    peaks = currentPeaks.slice();
    console.log("[computePreviousRootCID] Initial peaks:", peaks.map(c => c.toString()));
    const reconstructedParents: CID[] = [];
    let right: CID = await hashLeaf(newData);
    for (let i = leftInputs.length - 1; i >= 0; --i) {
      const left = leftInputs[i];
      // Reconstruct parent (for chaining/backward walk)
      const merged = await hashNode(left, right);
      reconstructedParents.unshift(merged);
      console.log(`  [reversal] Step i=${i}`);
      console.log("    merged:", merged.toString());
      console.log("    left:", left.toString());
      console.log("    right:", right.toString());
      // Always operate on the last peak (the root after all merges)
      if (peaks.length === 0) {
        console.error("    ERROR: No peaks left to unmerge during reversal");
        throw new Error("No peaks left to unmerge during reversal");
      }
      console.log("    peaks before pop:", peaks.map(c => c.toString()));
      peaks.pop(); // Remove the merged parent (root)
      peaks.push(left, right);
      console.log("    peaks after push:", peaks.map(c => c.toString()));
      right = merged; // For next iteration, right is the parent we just reconstructed
    }
    // Remove the new leaf CID from peaks
    const newLeafCID = await hashLeaf(newData);
    peaks = peaks.filter(c => c.toString() !== newLeafCID.toString());
    // Remove all reconstructed parents (none should be peaks in previous state)
    if (reconstructedParents.length > 0) {
      const parentSet = new Set(reconstructedParents.map(c => c.toString()));
      peaks = peaks.filter(c => !parentSet.has(c.toString()));
    }
    console.log("[computePreviousRootCID] previousPeaks (after filtering out new leaf and all parents):", peaks.map(c => c.toString()));
    // Output reconstructedParents for chaining
    return { previousRootCID: await bagPeaks(peaks), previousPeaks: peaks, reconstructedParents };

  }
}

// Helper to bag peaks left-to-right
async function bagPeaks(peaks: CID[]): Promise<CID> {
  if (peaks.length === 0) throw new Error("No peaks to bag");
  let root = peaks[0];
  for (let i = 1; i < peaks.length; ++i) {
    root = await hashNode(root, peaks[i]);
  }
  return root;
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


