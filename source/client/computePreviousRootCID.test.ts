import { MerkleMountainRange } from "../shared/mmr.ts"
import { computePreviousRootCID } from "./computePreviousRootCID.ts"
import { CID } from "multiformats/cid"

function randomBytes(len: number): Uint8Array {
  const arr = new Uint8Array(len)
  for (let i = 0; i < len; ++i) arr[i] = Math.floor(Math.random() * 256)
  return arr
}

(async () => {
  // 1. Create a new MMR
  const mmr = new MerkleMountainRange()

  // 2. Add leaves and record peaks after each insert
  const NUM_LEAVES = 23;
  const leaves = Array.from({length: NUM_LEAVES}, () => randomBytes(32));
  const roots: CID[] = [];
  const peaksHistory: CID[][] = [];
  const trails: any[] = [];
  for (let i = 0; i < leaves.length; ++i) {
    console.log(`MMR peaks before insert ${i+1}:`, mmr['peaks'].map((c: CID) => c.toString()))
    const trail = await mmr.addLeafWithTrail(leaves[i])
    const root = CID.parse(trail.rootCID)
    roots.push(root)
    peaksHistory.push(mmr['peaks'].slice())
    trails.push(trail)
    console.log(`MMR peaks after insert ${i+1}:`, mmr['peaks'].map((c: CID) => c.toString()))
  }

  // Loop: revert from N to N-1, down to 1
  for (let i = leaves.length - 1; i > 0; --i) {
    const trail = trails[i];
    const leftInputs = trail.leftInputsCIDs.map((s: string) => CID.parse(s));
    const { previousRootCID, previousPeaks } = await computePreviousRootCID(
      roots[i],
      peaksHistory[i],
      leaves[i],
      leftInputs
    );
    console.log(`\nRevert from ${i+1} to ${i} leaves:`);
    console.log("Expected root:", roots[i-1].toString());
    console.log("Actual prevRoot:", previousRootCID.toString());
    console.log("Expected peaks:", peaksHistory[i-1].map(c => c.toString()));
    console.log("Actual prevPeaks:", previousPeaks.map(c => c.toString()));
    if (previousRootCID.toString() !== roots[i-1].toString()) throw new Error(`Failed to recover previous root for ${i+1}->${i} leaves`);
    if (JSON.stringify(previousPeaks.map(c=>c.toString())) !== JSON.stringify(peaksHistory[i-1].map(c=>c.toString()))) throw new Error(`Failed to recover previous peaks for ${i+1}->${i} leaves`);
    console.log(`Test passed: revert from ${i+1} to ${i} leaves.`);
  }
})()
