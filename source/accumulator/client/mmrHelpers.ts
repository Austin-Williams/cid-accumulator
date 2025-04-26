import { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange.ts"
import { appendTrailToDB, getHighestContiguousLeafIndexWithData, getLeafRecord } from "./storageHelpers.ts"
import { putPinProvideToIPFS } from "./ipfsHelpers.ts"
import { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"

// Adds a leaf to the MMR, stores the trail in the DB, and pins the full trail to IPFS (if applicable).
export async function commitLeaf(
	ipfs: IpfsAdapter,
	mmr: MerkleMountainRange,
	storageAdapter: StorageAdapter,
	shouldPut: boolean,
	shouldProvide: boolean,
	getHighestCommittedLeafIndex: () => number,
	setHighestCommittedLeafIndex: (index: number) => void,
	leafIndex: number,
	newData: Uint8Array,
): Promise<void> {
	// Add leaf to MMR
	const trail = await mmr.addLeafWithTrail(leafIndex, newData)
	// Store trail in local DB (efficient append-only)
	await appendTrailToDB(storageAdapter, trail)
	// Pin and provide trail to IPFS
	if (shouldPut) {
		for (const { cid, dagCborEncodedData } of trail) {
			await putPinProvideToIPFS(ipfs, shouldPut, shouldProvide, cid, dagCborEncodedData)
		}
	}

	setHighestCommittedLeafIndex(getHighestCommittedLeafIndex() + 1)
}

/**
 * Rebuilds the Merkle Mountain Range (MMR) by committing all uncommitted leaves and pinning the full trail to IPFS.
 *
 * This function iterates through all uncommitted leaves and commits them one by one.
 * For each leaf, it adds the leaf to the MMR, stores the trail in the DB, and pins the full trail to IPFS.
 *
 * @returns A Promise that resolves when the MMR has been rebuilt from all uncommitted leaves.
 */
export async function rebuildAndProvideMMR(
	ipfs: IpfsAdapter,
	mmr: MerkleMountainRange,
	storageAdapter: StorageAdapter,
	shouldPin: boolean,
	shouldProvide: boolean,
	getHighestCommittedLeafIndex: () => number,
	setHighestCommittedLeafIndex: (index: number) => void,
): Promise<void> {
	console.log(
		`[Accumulator] ⛰️ Rebuilding the Merkle Mountain Range from synced leaves${shouldPin ? " and pinning to IPFS" : ""}...`,
	)
	const fromIndex: number = getHighestCommittedLeafIndex() + 1
	const toIndex: number = await getHighestContiguousLeafIndexWithData(storageAdapter)
	if (fromIndex > toIndex)
		throw new Error(
			`[Accumulator] Expected to commit leaves from ${fromIndex} to ${toIndex}, but found no newData for leaf ${fromIndex}`,
		)
	if (fromIndex === toIndex) return // All leaves already committed
	for (let i = fromIndex; i <= toIndex; i++) {
		const record = await getLeafRecord(storageAdapter, i)
		if (!record || !record.newData) throw new Error(`[Accumulator] Expected newData for leaf ${i}`)
		if (!(record.newData instanceof Uint8Array))
			throw new Error(`[Accumulator] newData for leaf ${i} is not a Uint8Array`)
		await commitLeaf(
			ipfs,
			mmr,
			storageAdapter,
			shouldPin,
			shouldProvide,
			getHighestCommittedLeafIndex,
			setHighestCommittedLeafIndex,
			i,
			record.newData,
		)
	}
	console.log(`[Accumulator] \u{2705} Fully rebuilt the Merkle Mountain Range up to leaf index ${toIndex}`)
	await storageAdapter.persist()
}
