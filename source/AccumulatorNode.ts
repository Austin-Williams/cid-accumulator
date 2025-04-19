import type { IpfsAdapter } from './interfaces/IpfsAdapter.ts'
import type { StorageAdapter } from './interfaces/StorageAdapter.ts'

/**
 * AccumulatorNode: Unified entry point for accumulator logic in any environment.
 * Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
 */
/**
 * Represents a single MMR peak with its CID and height.
 */
type PeakWithHeight = { cid: string, height: number }

/**
 * Represents all relevant data for a leaf/event in the accumulator.
 */
type LeafRecord = {
  event: any, // Replace with actual EventData type
  blockNumber: number,
  rootCid?: string,
  peaksWithHeights: PeakWithHeight[],
  // ...other fields as needed
}

/**
 * Represents a DAG node (leaf or link) in the accumulator.
 */
type DagNodeRecord = {
  cid: string, // or CID type
  data: Uint8Array | string, // serialized node data
  type: 'leaf' | 'link',
  leafIndex?: number,
  // ...other fields as needed (e.g., children, parent, height)
}

export class AccumulatorNode {
  ipfs: IpfsAdapter
  storage: StorageAdapter
  // ...other fields (provider, contract, etc.)

  constructor({ ipfs, storage }: { ipfs: IpfsAdapter; storage: StorageAdapter; [key: string]: any }) {
    this.ipfs = ipfs
    this.storage = storage
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
    for await (const { key: key, value } of this.storage.iterate('dag:')) {
      if (value && (value.type === 'leaf' || value.type === 'link')) {
        dagNodes.push(value)
      }
    }
    return dagNodes
  }

  /** Retrieve the latest leaf index (highest stored) efficiently. */
  async getLatestLeafIndex(): Promise<number | undefined> {
    return await this.storage.getMaxKey('leaf:')
  }

  /**
   * Syncs backwards from the latest leaf/block, fetching events and storing by leafIndex.
   */
  async syncBackwardsFromLatest(): Promise<void> {
    // TODO: Fetch latest leaf index, walk backwards, store events and computed root CIDs
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

