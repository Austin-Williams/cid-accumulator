import * as dagCbor from "../../utils/dagCbor.ts"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import type {
	AccumulatorClientConfig,
	DataNamespace,
	IpfsNamespace,
	StorageNamespace,
	SyncNamespace,
} from "../../types/types.ts"
import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { isBrowser, isNodeJs } from "../../utils/envDetection.ts"
import { getAccumulatorData } from "../../ethereum/commonCalls.ts"
import { rebuildAndProvideMMR } from "./mmrHelpers.ts"
import { getHighestContiguousLeafIndexWithData } from "./storageHelpers.ts"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange.ts"
import { NULL_CID } from "../../utils/constants.ts"
import { getStorageNamespace } from "./storageNamespace.ts"
import { getIpfsNamespace } from "./ipfsNamespace.ts"
import { getSyncNamespace } from "./syncNamespace.ts"
import { startLiveSync, stopLiveSync, syncBackwardsFromLatest } from "./syncHelpers.ts"
import { UniversalIpfsAdapter } from "../../adapters/ipfs/UniversalIpfsAdapter.ts"
import { IndexedDBAdapter } from "../../adapters/storage/IndexedDBAdapter.ts"
import { getDataNamespace } from "./dataNamespace.ts"

/**
 * AccumulatorClient: Unified entry point for accumulator logic in any environment.
 * Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
 */
export class AccumulatorClient {
	public config: AccumulatorClientConfig
	public data?: DataNamespace
	public ipfs?: IpfsNamespace
	public storage?: StorageNamespace
	public sync?: SyncNamespace
	public mmr: MerkleMountainRange

	constructor(config: AccumulatorClientConfig) {
		this.config = config
		this.mmr = new MerkleMountainRange()
	}

	// TODO Break this out into initStorage, initIpfs, initSync and then call them here in init()
	// Move them into their own files to reduce clutter here.
	// Make sure the initSync uses the optional signature and calldata override parameters in config.
	// That will allows us to customize the initialization process if we want to (e.g. for the community version)
	async init(): Promise<void> {
		// SET UP STORAGE
		// Create a Storage adapter appropriate for the environment
		let storageAdapter: StorageAdapter
		if (isBrowser()) {
			storageAdapter = new IndexedDBAdapter()
		} else {
			const { JSMapAdapter } = await import("../../adapters/storage/JSMapAdapter.ts")
			storageAdapter = new JSMapAdapter(this.config.DB_PATH)
		}
		// Initialize the Storage namespace
		this.storage = getStorageNamespace(storageAdapter)

		// Ensure DB is open
		await this.storage.storageAdapter.open()

		// Log how many leaves are in the DB
		const highestLeafIndexInDB = await getHighestContiguousLeafIndexWithData(this.storage.storageAdapter)
		console.log(`[Accumulator] \u{1F4E4} Found ${highestLeafIndexInDB + 1} leafs in DB`)

		// SET UP IPFS
		// Create an IPFS adapter
		const ipfsAdapter: IpfsAdapter = new UniversalIpfsAdapter(
			this.config.IPFS_GATEWAY_URL,
			this.config.IPFS_API_URL,
			this.config.IPFS_PUT_IF_POSSIBLE,
			this.config.IPFS_PIN_IF_POSSIBLE,
			this.config.IPFS_PROVIDE_IF_POSSIBLE,
		)

		let shouldPut = this.config.IPFS_PUT_IF_POSSIBLE && this.config.IPFS_API_URL !== undefined
		let shouldPin = this.config.IPFS_PIN_IF_POSSIBLE && this.config.IPFS_API_URL !== undefined
		let shouldProvide = this.config.IPFS_PROVIDE_IF_POSSIBLE && this.config.IPFS_API_URL !== undefined && isNodeJs()
		if (!shouldPut) shouldPin = false // Doesn't make sense to pin if they don't put
		if (!shouldPin) shouldProvide = false // Doesn't make sense to provide if they don't pin

		// Check if IPFS Gateway connection is working
		console.log("[Accumulator] \u{1F440} Checking IPFS Gateway connection...")
		try {
			// Attempt to fetch a block
			await ipfsAdapter.getBlock(NULL_CID)
			console.log("[Accumulator] \u{2705} Connected to IPFS Gateway.")
		} catch (e) {
			console.error("[Accumulator] \u{274C} Failed to connect to IPFS Gateway:", e)
			throw new Error("Failed to connect to IPFS Gateway. Must abort. See above error.")
		}

		// If relevant, check that IPFS API connection can PUT/PIN
		if (shouldPut) {
			console.log("[Accumulator] \u{1F440} Checking IPFS API connection (attempting to PUT a block)...")
			try {
				// Attempt to put a block
				await ipfsAdapter.putBlock(NULL_CID, dagCbor.encode(null))
				console.log("[Accumulator] \u{2705} Connected to IPFS API and verified it can PUT blocks.")
			} catch (e) {
				shouldPut = false
				shouldPin = false
				console.error("[Accumulator] \u{274C} Failed to connect to IPFS API:", e)
				console.log("[Accumulator] 🤷‍♂️ Will continue without IPFS API connection (Using IPFS Gateway only).")
			}
		}

		// If relevant, check that IPFS API connection can PUT/PIN
		if (shouldProvide && shouldPut) {
			console.log("[Accumulator] \u{1F440} Checking if IPFS API can provide (advertise) blocks...")
			try {
				// Attempt to provide a block
				await ipfsAdapter.provide(NULL_CID)
				console.log("[Accumulator] \u{2705} Connected to IPFS API and verified it can PROVIDE blocks.")
			} catch (e) {
				shouldProvide = false
				console.error("[Accumulator] \u{274C} Failed to verify that the IPFS API can provide (advertise) blocks.", e)
				console.log("[Accumulator] 🤷‍♂️ Will continue without telling IPFS API to provide (advertise) blocks.")
			}
		}

		// Initialize the IPFS namespace object
		this.ipfs = getIpfsNamespace(ipfsAdapter, this.storage.storageAdapter, shouldPut, shouldPin, shouldProvide)

		console.log("[Accumulator] 📜 IPFS Capability Summary:")
		console.log(`[Accumulator] 📜 Summary: IPFS Gateway connected: YES`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PUT is set up: ${shouldPut ? "YES" : "NO"}`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PIN is set up: ${shouldPin ? "YES" : "NO"}`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PROVIDE is set up: ${shouldProvide ? "YES" : "NO"}`)

		// SET UP SYNC
		// TODO: add support for signature and calldata overrides for getLatestCID, getAccumulatorData, and
		// signature overrides for getLeafInsertLogs and getLeafInsertLogForTargetLeafIndex
		// Check if Ethereum connection is working
		console.log("[Accumulator] \u{1F440} Checking Ethereum connection...")
		let lastProcessedBlock: number = 0
		try {
			const { meta } = await getAccumulatorData(this.config.ETHEREUM_HTTP_RPC_URL, this.config.CONTRACT_ADDRESS)
			console.log(
				`[Accumulator] \u{2705} Connected to Ethereum. Target contract address: ${this.config.CONTRACT_ADDRESS}`,
			)
			lastProcessedBlock = meta.deployBlockNumber - 1
		} catch (e) {
			console.error("[Accumulator] \u{274C} Failed to connect to Ethereum node:", e)
			throw new Error("Failed to connect to Ethereum node. See above error.")
		}
		// Initialize a Sync namespace object
		this.sync = getSyncNamespace(
			this.ipfs.ipfsAdapter,
			this.mmr,
			this.storage.storageAdapter,
			this.config.ETHEREUM_HTTP_RPC_URL,
			this.config.ETHEREUM_WS_RPC_URL,
			this.config.CONTRACT_ADDRESS,
			lastProcessedBlock,
			this.ipfs.shouldPut,
			this.ipfs.shouldPin,
			this.ipfs.shouldProvide,
		)

		this.data = getDataNamespace(
			this.storage.storageAdapter,
			() => this.sync!.highestCommittedLeafIndex,
			this.sync!.onNewLeaf,
		)

		console.log("[Accumulator] \u{2705} Successfully initialized.")
	}

	async start(): Promise<void> {
		await this.init()

		if (!this.ipfs || !this.sync || !this.storage)
			throw new Error("Not all namespaces present. This should never happen.")

		await syncBackwardsFromLatest(
			this.ipfs.ipfsAdapter,
			this.storage.storageAdapter,
			this.sync.ethereumHttpRpcUrl,
			this.sync.contractAddress,
			(block: number) => (this.sync!.lastProcessedBlock = block),
			1000,
		)

		await rebuildAndProvideMMR(
			this.ipfs.ipfsAdapter,
			this.mmr,
			this.storage.storageAdapter,
			this.ipfs.shouldPin,
			this.ipfs.shouldProvide,
			() => this.sync!.highestCommittedLeafIndex,
			(block: number) => (this.sync!.highestCommittedLeafIndex = block),
		)

		// Expose client in browser (to give user control)
		if (isBrowser()) {
			// @ts-ignore
			window.accumulatorClient = this
		}

		this.ipfs.rePinAllDataToIPFS() // Fire-and-forget, no-ops if this.ipfs.shouldPin is false

		startLiveSync(
			// Fire-and-forget
			this.ipfs.ipfsAdapter,
			this.mmr,
			this.storage.storageAdapter,
			this.sync.contractAddress,
			this.sync.ethereumHttpRpcUrl,
			this.sync.ethereumWsRpcUrl,
			this.sync.websocket,
			(newWs: WebSocket | undefined) => (this.sync!.websocket = newWs),
			() => this.sync!.liveSyncRunning,
			(isRunning: boolean) => (this.sync!.liveSyncRunning = isRunning),
			(interval: ReturnType<typeof setTimeout> | undefined) => (this.sync!.liveSyncInterval = interval),
			this.sync.lastProcessedBlock,
			(block: number) => (this.sync!.lastProcessedBlock = block),
			() => this.sync!.highestCommittedLeafIndex,
			(leafIndex: number) => (this.sync!.highestCommittedLeafIndex = leafIndex),
			this.ipfs.shouldPin,
			this.ipfs.shouldProvide,
		)
	}

	/**
	 * Gracefully shuts down the AccumulatorClient: stops live sync and closes the DB if possible.
	 * Safe to call multiple times.
	 */
	public async shutdown(): Promise<void> {
		if (!this.sync || !this.ipfs || !this.storage)
			throw new Error("Not all namespaces present. This should never happen.")
		console.log("[Accumulator] 👋 Shutting down gracefully.")
		// Stop live sync (polling or WS)
		stopLiveSync(
			this.sync!.websocket,
			(newWs: WebSocket | undefined) => (this.sync!.websocket = newWs),
			() => this.sync!.liveSyncInterval,
			(isRunning: boolean) => (this.sync!.liveSyncRunning = isRunning),
			(interval: ReturnType<typeof setTimeout> | undefined) => (this.sync!.liveSyncInterval = interval),
		)
		// Close DB if possible
		await this.storage.storageAdapter.close()
		console.log("[Accumulator] 🏁 Done.")
	}
}
