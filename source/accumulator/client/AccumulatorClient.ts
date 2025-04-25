import * as dagCbor from "../../utils/dagCbor.ts"
import { isBrowser } from "../../utils/envDetection.ts"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import type { AccumulatorClientConfig } from "../../types/types.ts"
import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { syncBackwardsFromLatest, startLiveSync, stopLiveSync } from "./syncHelpers.ts"
import { rebuildAndProvideMMR } from "./mmrHelpers.ts"
import { rePinAllDataToIPFS } from "./ipfsHelpers.ts"
import { getHighestContiguousLeafIndexWithData } from "./storageHelpers.ts"
import { ethRpcFetch } from "../../ethereum/ethRpcFetch.ts"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange.ts"
import { isNodeJs } from "../../utils/envDetection.ts"
import { NULL_CID } from "../../utils/constants.ts"

/**
 * AccumulatorClient: Unified entry point for accumulator logic in any environment.
 * Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
 */
export class AccumulatorClient {
	ipfs: IpfsAdapter
	storage: StorageAdapter
	ethereumHttpRpcUrl: string
	ethereumWsRpcUrl?: string
	contractAddress: string
	mmr: MerkleMountainRange
	highestCommittedLeafIndex: number

	shouldPut: boolean
	shouldPin: boolean
	shouldProvide: boolean

	protected liveSyncRunning: boolean = false
	protected liveSyncInterval: ReturnType<typeof setTimeout> | undefined
	protected lastProcessedBlock: number = 0
	protected ws: WebSocket | undefined

	constructor(
		config: AccumulatorClientConfig & {
			ipfs: IpfsAdapter
			storage: StorageAdapter
		},
	) {
		this.ipfs = config.ipfs
		this.storage = config.storage
		this.ethereumHttpRpcUrl = config.ETHEREUM_HTTP_RPC_URL
		this.ethereumWsRpcUrl = config.ETHEREUM_WS_RPC_URL
		this.contractAddress = config.CONTRACT_ADDRESS
		this.mmr = new MerkleMountainRange()
		this.highestCommittedLeafIndex = -1
		this.shouldPut = config.IPFS_PUT_IF_POSSIBLE && config.IPFS_API_URL !== undefined
		this.shouldPin = config.IPFS_PIN_IF_POSSIBLE && config.IPFS_API_URL !== undefined
		this.shouldProvide = config.IPFS_PROVIDE_IF_POSSIBLE && config.IPFS_API_URL !== undefined && isNodeJs()

		if (!this.shouldPut) this.shouldPin = false // Doesn't make sense to pin if they don't put
		if (!this.shouldPin) this.shouldProvide = false // Doesn't make sense to provide if they don't pin
	}

	async init(): Promise<void> {
		// Ensure DB is open
		await this.storage.open()

		// Log how many leafs we have in the DB
		const highestLeafIndexInDB = await getHighestContiguousLeafIndexWithData(this.storage)
		console.log(`[Accumulator] \u{1F4E4} Found ${highestLeafIndexInDB + 1} leafs in DB`)

		// Check if Ethereum connection is working
		console.log("[Accumulator] \u{1F440} Checking Ethereum connection...")
		try {
			// Use eth_chainId as a lightweight check
			const chainId = await ethRpcFetch(this.ethereumHttpRpcUrl, "eth_chainId", [])
			console.log(`[Accumulator] \u{2705} Connected to Ethereum node, chainId: ${chainId}`)
		} catch (e) {
			console.error("[Accumulator] \u{274C} Failed to connect to Ethereum node:", e)
			throw new Error("Failed to connect to Ethereum node. See above error.")
		}

		// Check if IPFS Gateway connection is working
		console.log("[Accumulator] \u{1F440} Checking IPFS Gateway connection...")
		try {
			// Attempt to fetch a block
			await this.ipfs.getBlock(NULL_CID)
			console.log("[Accumulator] \u{2705} Connected to IPFS Gateway.")
		} catch (e) {
			console.error("[Accumulator] \u{274C} Failed to connect to IPFS Gateway:", e)
			throw new Error("Failed to connect to IPFS Gateway. Must abort. See above error.")
		}

		// If relevant, check that IPFS API connection can PUT/PIN
		if (this.shouldPut) {
			console.log("[Accumulator] \u{1F440} Checking IPFS API connection (attempting to PUT a block)...")
			try {
				// Attempt to put a block
				await this.ipfs.putBlock(NULL_CID, dagCbor.encode(null))
				console.log("[Accumulator] \u{2705} Connected to IPFS API and verified it can PUT blocks.")
			} catch (e) {
				this.shouldPut = false
				this.shouldPin = false
				console.error("[Accumulator] \u{274C} Failed to connect to IPFS API:", e)
				console.log("[Accumulator] 🤷‍♂️ Will continue without IPFS API connection (Using IPFS Gateway only).")
			}
		}

		// If relevant, check that IPFS API connection can PUT/PIN
		if (this.shouldProvide && this.shouldPut) {
			console.log("[Accumulator] \u{1F440} Checking if IPFS API can provide (advertise) blocks...")
			try {
				// Attempt to provide a block
				await this.ipfs.provide(NULL_CID)
				console.log("[Accumulator] \u{2705} Connected to IPFS API and verified it can PROVIDE blocks.")
			} catch (e) {
				this.shouldProvide = false
				console.error("[Accumulator] \u{274C} Failed to verify that the IPFS API can provide (advertise) blocks.", e)
				console.log("[Accumulator] 🤷‍♂️ Will continue without telling IPFS API to provide (advertise) blocks.")
			}
		}
		console.log("[Accumulator] \u{2705} Successfully initialized. Summary:")
		console.log(`[Accumulator] 📜 Summary: IPFS Gateway connected: YES`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PUT is set up: ${this.shouldPut ? "YES" : "NO"}`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PIN is set up: ${this.shouldPin ? "YES" : "NO"}`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PROVIDE is set up: ${this.shouldProvide ? "YES" : "NO"}`)
	}

	async start(): Promise<void> {
		await this.init()
		await syncBackwardsFromLatest(
			this.ipfs,
			this.storage,
			this.ethereumHttpRpcUrl,
			this.contractAddress,
			(block: number) => (this.lastProcessedBlock = block),
			1000, // maxBlockRangePerRpcCall
		)
		await rebuildAndProvideMMR(
			this.ipfs,
			this.mmr,
			this.storage,
			this.shouldPin,
			this.shouldProvide,
			() => this.highestCommittedLeafIndex,
			(block: number) => (this.highestCommittedLeafIndex = block),
		)

		// Expose client in browser (to give user access control)
		if (isBrowser()) {
			// @ts-ignore
			window.accumulatorClient = this
		}

		this.rePinAllDataToIPFS() // Fire-and-forget, no-ops if this.shouldPin is false

		startLiveSync( // Fire-and-forget
			this.ipfs,
			this.mmr,
			this.storage,
			this.contractAddress,
			this.ethereumHttpRpcUrl,
			this.ethereumWsRpcUrl,
			this.ws,
			(newWs: WebSocket | undefined) => (this.ws = newWs),
			() => this.liveSyncRunning,
			(isRunning: boolean) => (this.liveSyncRunning = isRunning),
			(interval: ReturnType<typeof setTimeout> | undefined) => (this.liveSyncInterval = interval),
			this.lastProcessedBlock,
			(block: number) => (this.lastProcessedBlock = block),
			() => this.highestCommittedLeafIndex,
			(leafIndex: number) => (this.highestCommittedLeafIndex = leafIndex),
			this.shouldPin,
			this.shouldProvide,
		)
	}

	/**
	 * Gracefully shuts down the AccumulatorClient: stops live sync and closes the DB if possible.
	 * Safe to call multiple times.
	 */
	public async shutdown(): Promise<void> {
		console.log("[Accumulator] 👋 Shutting down gracefully.")
		// Stop live sync (polling or WS)
		stopLiveSync(
			this.ws,
			(newWs: WebSocket | undefined) => (this.ws = newWs),
			this.liveSyncInterval,
			(isRunning: boolean) => (this.liveSyncRunning = isRunning),
			(interval: ReturnType<typeof setTimeout> | undefined) => (this.liveSyncInterval = interval),
		)
		// Close DB if possible
		await this.storage.close()
		console.log("[Accumulator] 🏁 Done.")
	}

	// TODO behind a .sync namespace:
	// - startSubscriptionSync
	// - startPollingSync
	// - startLiveSync (autodetects subscription support)
	// - stopLiveSync
	// - syncBackwardsFromLatest

	/**
	 * Initiates a background process to re-pin all CIDs and associated data (leaves, roots, and intermediate nodes)
	 * to the configured IPFS node. This is useful for recovering or ensuring pinning of all
	 * data previously synced by the accumulator, especially if the IPFS node has lost data.
	 *
	 * This operation is typically not required during normal operation, as data is automatically pinned
	 * during MMR rebuilds and new leaf insertions. It is provided as a utility for
	 * maintenance and data recovery scenarios.
	 *
	 * This method is non-blocking and fire-and-forget: it does not wait for completion and does not return a Promise.
	 * Progress and errors are logged to the console asynchronously.
	 *
	 * @remarks
	 * - If you need to track completion or handle errors, consider refactoring to return a Promise.
	 * - For normal operation, manual re-pinning is not necessary.
	 */
	public rePinAllDataToIPFS(): void {
		rePinAllDataToIPFS(this.ipfs, this.storage, this.shouldPut, this.shouldPin, this.shouldProvide)
	}
}
