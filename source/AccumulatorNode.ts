import { ethers } from "ethers"
import type { IpfsAdapter } from "./interfaces/IpfsAdapter.ts"
import type { StorageAdapter } from "./interfaces/StorageAdapter.ts"
import { parseAccumulatorMetaBits } from "./shared/accumulator.ts"
import { cidFromBytes32HexString } from "./shared/codec.ts"
import type { DagNodeRecord, PeakWithHeight, LeafRecord } from "./shared/types.ts"
import { CID } from "multiformats/cid"
import { resolveMerkleTreeOrThrow } from "./shared/ipfs.ts"
import { decodeLeafInsert } from "./shared/codec.ts"
import { bagPeaksWithHeights, computePreviousRootCID } from "./shared/computePreviousRootCID.ts"

/**
 * AccumulatorNode: Unified entry point for accumulator logic in any environment.
 * Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
 */

export class AccumulatorNode {
	ipfs: IpfsAdapter
	storage: StorageAdapter
	contract: ethers.Contract // Should be ethers.Contract
	// ...other fields (provider, contract, etc.)

	constructor({
		ipfs,
		storage,
		contract,
	}: {
		ipfs: IpfsAdapter
		storage: StorageAdapter
		contract: any
		[key: string]: any
	}) {
		this.ipfs = ipfs
		this.storage = storage
		this.contract = contract
	}

	// --- DB Access Methods ---

	/** Store a leaf record by leafIndex. */
	async putLeafRecord(leafIndex: number, record: LeafRecord): Promise<void> {
		const existing = await this.getLeafRecord(leafIndex)
		if (existing) {
			// Merge: prefer new values if present, fallback to existing
			const merged: LeafRecord = {
				newData: record.newData ?? existing.newData,
				event: record.event ?? existing.event,
				blockNumber: record.blockNumber ?? existing.blockNumber,
				rootCid: record.rootCid ?? existing.rootCid,
				peaksWithHeights: record.peaksWithHeights ?? existing.peaksWithHeights,
			}
			await this.storage.put(`leaf:${leafIndex}`, merged)
		} else {
			await this.storage.put(`leaf:${leafIndex}`, record)
		}
	}

	/** Retrieve a leaf record by leafIndex. */
	async getLeafRecord(leafIndex: number): Promise<LeafRecord | undefined> {
		return await this.storage.get(`leaf:${leafIndex}`)
	}

	/** Store a DAG node record by CID. */
	async putDagNode(cid: string, record: DagNodeRecord): Promise<void> {
		await this.storage.put(`dag:${cid}`, record)
	}

	/** Retrieve a DAG node record by CID. */
	async getDagNode(cid: string): Promise<DagNodeRecord | undefined> {
		return await this.storage.get(`dag:${cid}`)
	}

	/** Retrieve all DAG node records efficiently using async iteration. */
	async getAllDagNodes(): Promise<DagNodeRecord[]> {
		const dagNodes: DagNodeRecord[] = []
		for await (const { key: _key, value } of this.storage.iterate("dag:")) {
			if (value && (value.type === "leaf" || value.type === "link")) {
				dagNodes.push(value)
			}
		}
		return dagNodes
	}

	/** Retrieve the latest leaf index (highest stored in DB) efficiently. */
	async getLatestLeafIndex(): Promise<number | undefined> {
		return await this.storage.getMaxKey("leaf:")
	}

	/**
	 * Fetches on-chain accumulator metadata and peaks.
	 * Uses contract.getAccumulatorData() and parses it.
	 */
	async getOnChainAccumulatorMeta(): Promise<{
		leafCount: number
		previousInsertBlockNumber: number
		deployBlockNumber: number
		peaksWithHeight: PeakWithHeight[]
	}> {
		const [mmrMetaBits, peaksArr]: [bigint, string[]] = await this.contract.getAccumulatorData()
		const meta = parseAccumulatorMetaBits(mmrMetaBits)
		const peaksCids: CID<unknown, 113, 18, 1>[] = await Promise.all(
			peaksArr
				.slice(0, meta.peakCount)
				.map(async (x) => (await cidFromBytes32HexString(x)) as unknown as CID<unknown, 113, 18, 1>),
		)
		// Zip the peaks and peakHeights into PeakWithHeight[]
		const peaksWithHeight: PeakWithHeight[] = peaksCids.map((cid, i) => ({ cid, height: meta.peakHeights[i] }))
		return { ...meta, peaksWithHeight }
	}

	/**
	 * Searches from leafIndex 0 to maxLeafIndex for leaves that are missing newData.
	 * Returns an array of leaf indexes that are missing newData.
	 */
	async getLeafIndexesWithMissingNewData(maxLeafIndex: number): Promise<number[]> {
		const missing: number[] = []
		for (let i = 0; i <= maxLeafIndex; i++) {
			const rec = await this.getLeafRecord(i)
			if (!rec || !rec.newData) missing.push(i)
		}
		return missing
	}

	/**
	 * Syncs backwards from the latest leaf/block, fetching events and storing by leafIndex.
	 * Uses on-chain metadata to determine where to start.
	 */
	async syncBackwardsFromLatest(maxBlockRange = 1000): Promise<void> {
		const meta = await this.getOnChainAccumulatorMeta()
		if (meta.leafCount === 0) {
			console.log("[pinner] No leaves to sync.")
			return
		}
		const currentLeafIndex = meta.leafCount - 1
		const currentBlock = meta.previousInsertBlockNumber
		const minBlock = meta.deployBlockNumber
		let currentPeaksWithHeights = meta.peaksWithHeight

		// Compute the current root CID from the current peaks
		const currentRootCID = await bagPeaksWithHeights(currentPeaksWithHeights)

		// Try to resolve the entire DAG from the root CID
		console.log(`Checking availability of root CID ${currentRootCID.toString()} on IPFS...`)
		const success: boolean = await this.getAndResolveCID(currentRootCID)
		if (success) {
			const missing = await this.getLeafIndexesWithMissingNewData(currentLeafIndex)
			if (missing.length !== 0) throw new Error("Unexpectedly missing newData for leaf indices: " + missing.join(", "))
			console.log("Successfully resolved all data from the current root CID.")
			return
		}
		console.log("Root CID not fully available on IPFS. Beginning walkback loop...")

		let oldestRootCid: CID<unknown, 113, 18, 1> = currentRootCID

		// --- Batch event fetching ---
		const leafInsertFilter = this.contract.filters.LeafInsert()
		for (let endBlock = currentBlock; endBlock >= minBlock; endBlock -= maxBlockRange) {
			const startBlock = Math.max(minBlock, endBlock - maxBlockRange + 1)
			console.log(`Querying blocks ${startBlock} to ${endBlock} for LeafInsert events...`)
			const logs = await this.contract.queryFilter(leafInsertFilter, startBlock, endBlock)
			if (logs.length === 0) {
				continue
			}
			console.log(`Found ${logs.length} LeafInsert events`)
			// Decode all logs first
			const decodedEvents = await Promise.all(logs.map((log) => decodeLeafInsert(log)))
			// Sort by leafIndex descending
			for (const event of decodedEvents.sort((a, b) => b.leafIndex - a.leafIndex)) {
				// Compute previous root CID and peaks
				const { previousRootCID, previousPeaksWithHeights } = await computePreviousRootCID(
					currentPeaksWithHeights,
					event.newData,
					event.leftInputs,
				)
				await this.putLeafRecord(event.leafIndex, {
					newData: event.newData,
					event,
					blockNumber: event.blockNumber,
					rootCid: previousRootCID,
					peaksWithHeights: previousPeaksWithHeights,
				})
				// Update for next iteration
				currentPeaksWithHeights = previousPeaksWithHeights
				oldestRootCid = previousRootCID
			}
			// After the batch, check if the oldest root CID is available on IPFS
			console.log(`Checking availability of root CID ${oldestRootCid.toString()} on IPFS...`)
			const success = await this.getAndResolveCID(oldestRootCid)
			if (success) {
				const missing = await this.getLeafIndexesWithMissingNewData(currentLeafIndex)
				if (missing.length !== 0)
					throw new Error("Unexpectedly missing newData for leaf indices: " + missing.join(", "))
				console.log(`Successfully resolved all data from old root CID ${oldestRootCid.toString()}.`)
				return
			}
			console.log("Root CID not fully available on IPFS. Continuing to walkback...")
		}
		// If we get here, we've fully synced backwards using only event data (no data found on IPFS)
		console.log("Fully synced backwards using only event data (no data found on IPFS)")
		const missing = await this.getLeafIndexesWithMissingNewData(currentLeafIndex)
		if (missing.length !== 0) throw new Error("Unexpectedly missing newData for leaf indices: " + missing.join(", "))
		console.log("Successfully resolved all data from contract events.")
	}

	/**
	 * Recursively attempts to resolve the entire DAG from a given root CID using the IPFS adapter.
	 * If it succeeds, adds the leaf data to the database.
	 *
	 * @param cid - The root CID to resolve.
	 * @returns true if all nodes are available, false otherwise.
	 */
	async getAndResolveCID(cid: CID<unknown, 113, 18, 1>): Promise<boolean> {
		try {
			const leaves = await resolveMerkleTreeOrThrow(cid, this.ipfs)
			console.log(`Found and fully resolved root CID ${cid.toString()} on IPFS. Aquired ${leaves.length} leaves.`)
			// Store all the leaves' newData values in the DB as LeafRecords
			for (let i = 0; i < leaves.length; i++) await this.putLeafRecord(i, { newData: leaves[i] })
			// Optionally: console.log(`Number of leaves: ${leaves.length}`)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Periodically checks IPFS for available root CIDs as we sync backwards.
	 */
	async checkIpfsForAvailableRootCids(): Promise<void> {
		// TODO: For each root CID, check IPFS for availability
	}

	/**
	 * If an old root CID is found on IPFS, performs binary search forward to find the latest available CID.
	 */
	async binarySearchForwardFromIpfsRoot(): Promise<void> {
		// TODO: Use binary search to minimize IPFS calls, find latest available root CID
	}

	/**
	 * Merges downloaded IPFS DAG data with locally stored event data to reconstruct the full state.
	 */
	async mergeIpfsAndEventData(): Promise<void> {
		// TODO: Download DAG from IPFS, replay events forward
	}

	/**
	 * Once fully synced, rebuilds and pins/provides the entire DAG.
	 */
	async rebuildAndPinDag(): Promise<void> {
		// TODO: Rebuild DAG, pin and provide all CIDs
	}

	/**
	 * Listens for new events and keeps the node up-to-date in real time.
	 */
	async startLiveSync(): Promise<void> {
		// TODO: Subscribe to events, update state and pin as new data arrives
	}
}
