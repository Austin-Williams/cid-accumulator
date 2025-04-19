import type { IpfsAdapter } from "./interfaces/IpfsAdapter.ts"
import type { StorageAdapter } from "./interfaces/StorageAdapter.ts"
import { parseAccumulatorMetaBits } from "./shared/accumulator.ts"
import { cidFromBytes32HexString } from "./shared/codec.ts"
import type { DagNodeRecord, PeakWithHeight, LeafRecord } from "./shared/types.ts"
import { CID } from "multiformats/cid"

/**
 * AccumulatorNode: Unified entry point for accumulator logic in any environment.
 * Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
 */

export class AccumulatorNode {
	ipfs: IpfsAdapter
	storage: StorageAdapter
	contract: any // Should be ethers.Contract
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
		// ...initialize other fields
	}

	// --- DB Access Methods ---

	/** Store a leaf record by leafIndex. */
	async putLeafRecord(leafIndex: number, record: LeafRecord): Promise<void> {
		await this.storage.put(`leaf:${leafIndex}`, record)
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
		for await (const { key: key, value } of this.storage.iterate("dag:")) {
			if (value && (value.type === "leaf" || value.type === "link")) {
				dagNodes.push(value)
			}
		}
		return dagNodes
	}

	/** Retrieve the latest leaf index (highest stored) efficiently. */
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
		const peaksCids: CID[] = await Promise.all(peaksArr.slice(0, meta.peakCount).map(cidFromBytes32HexString))
		// Zip the peaks and peakHeights into PeakWithHeight[]
		const peaksWithHeight: PeakWithHeight[] = peaksCids.map((cid, i) => ({ cid, height: meta.peakHeights[i] }))
		return { ...meta, peaksWithHeight }
	}

	/**
	 * Syncs backwards from the latest leaf/block, fetching events and storing by leafIndex.
	 * Uses on-chain metadata to determine where to start.
	 */
	async syncBackwardsFromLatest(): Promise<void> {
		const meta = await this.getOnChainAccumulatorMeta()
		let currentLeafIndex = meta.leafCount - 1
		let currentBlock = meta.previousInsertBlockNumber
		const minBlock = meta.deployBlockNumber
		// TODO: Walk backwards from currentLeafIndex/currentBlock to minBlock
		// For each leafIndex:
		//   - Fetch event data from chain
		//   - Compute rootCid, peaksWithHeights
		//   - Store in DB
		//   - Optionally check IPFS for rootCid
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
