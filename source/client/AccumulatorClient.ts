import { ethers } from "ethers"
import { CID } from "multiformats/cid"
import { PeakWithHeight } from "./computePreviousRootCID.ts"

interface WalkbackInitState {
	provider: ethers.JsonRpcProvider
	contract: ethers.Contract
	initialPeaksWithHeights: PeakWithHeight[]
	initialLeafIndex: number
	initialBlockNumber: number
}

/**
 * AccumulatorClient
 *
 * This class is designed to work in both Node.js and browser environments.
 * - All dependencies (ethers, multiformats, etc.) are compatible with Node and browser.
 * - No Node-only APIs (fs, Buffer, process, etc.) are used.
 * - All file/data access must be via HTTP, RPC, or in-memory.
 *
 * IPFS integration:
 * - For IPFS access, pass a Helia client (https://github.com/heliajs/helia) to relevant methods.
 *   Helia is designed for browser and modern JS environments, and works in Node as well.
 * - Do not use Node-only IPFS APIs or daemons.
 *
 * Example usage:
 *   import { createHelia } from 'helia';
 *   const helia = await createHelia();
 *   const client = new AccumulatorClient({ provider, contract, ... });
 *   await client.findLatestAvailableRootCidOnIpfs(helia.block, ...);
 */
export class AccumulatorClient {
	provider: ethers.JsonRpcProvider
	contract: ethers.Contract
	currentPeaksWithHeights: PeakWithHeight[]
	currentLeafIndex: number
	currentBlockNumber: number

	constructor(init: WalkbackInitState) {
		this.provider = init.provider
		this.contract = init.contract
		this.currentPeaksWithHeights = init.initialPeaksWithHeights
		this.currentLeafIndex = init.initialLeafIndex
		this.currentBlockNumber = init.initialBlockNumber
	}

	/**
	 * Walk back one step. Updates internal state.
	 * Returns true if successful, false if no more steps can be taken.
	 * Makes one RPC call getting a single LeafInsert log from a single block.
	 */
	async stepBack(): Promise<boolean> {
		// TODO: Implement fetching the log, updating peaks, leaf index, and block number
		return false
	}

	/**
	 * Walk back multiple steps, to a given leaf index (inclusive).
	 * Returns the number of steps taken.
	 * Makes one RPC call per step to get a single LeafInsert log from a single block.
	 */
	async walkBackTo(targetLeafIndex: number): Promise<number> {
		// TODO: Implement repeated stepBack until targetLeafIndex is reached
		return 0
	}

	/**
	 * Fetches a batch of past LeafInsert events between two leaf indices (inclusive).
	 * Returns the events in order from newest to oldest.
	 * This uses a single RPC call to getLogs for efficiency.
	 */
	async fetchPastEventsBatch(fromLeafIndex: number, toLeafIndex: number): Promise<any[]> {
		// TODO: Implement batch fetching of logs using provider.getLogs/filter
		return []
	}

	/**
	 * Walk back multiple steps in a single batch, updating state for each event.
	 * Uses batch event fetching to minimize RPC calls (fewer calls but larger block range per call).
	 * Returns the number of steps actually taken.
	 */
	async walkBackBatch(targetLeafIndex: number, batchSize: number = 10): Promise<number> {
		// TODO: Implement efficient walkback using batch event fetch and state updates
		return 0
	}

	/**
	 * Efficiently finds the most recent root CID available on IPFS.
	 * Uses large backward jumps and then binary search forward to minimize IPFS and RPC calls.
	 * Returns the latest available root CID, its state, and the logs/events needed to sync forward.
	 *
	 * @param ipfsClient - A Helia block or dag API (e.g. helia.block or helia.dag) with a .get(cid) method
	 * @param options - Optional parameters: jumpStep (default 1000), minStep (default 1), maxSearch (default: all)
	 */
	async findLatestAvailableRootCidOnIpfs(
		ipfsClient: any,
		options?: {
			jumpStep?: number
			minStep?: number
			maxSearch?: number
			ipfsCheckMethod?: "block" | "dag"
		},
	): Promise<{
		cid: CID
		state: any
		forwardEvents: any[]
	}> {
		// 1. Walk back in large jumps (jumpStep), checking IPFS for each root CID.
		// 2. When you find an available CID, binary search forward to find the most recent available.
		// 3. Return the CID, state at that point, and all already-fetched events from there to latest.
		// TODO: Implement logic using batch log fetching and efficient IPFS checking.
		throw new Error("Not yet implemented")
	}
}
