import type {
	AccumulatorClientConfig,
	DataNamespace,
	IpfsNamespace,
	StorageNamespace,
	SyncNamespace,
} from "../../types/types.ts"
import { defaultConfig } from "./defaultConfig.ts"
import { isBrowser } from "../../utils/envDetection.ts"
import { rebuildAndProvideMMR } from "./mmrHelpers.ts"
import { getHighestContiguousLeafIndexWithData } from "./storageHelpers.ts"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange.ts"
import { startLiveSync, stopLiveSync, syncBackwardsFromLatest } from "./syncHelpers.ts"
import { initStorage } from "./initStorage.ts"
import { initIpfs } from "./initIpfs.ts"
import { initSync } from "./initSync.ts"
import { getDataNamespace } from "./dataNamespace.ts"
import { logConfig } from "../../utils/configLogger.ts"

/**
 * AccumulatorClient: Unified entry point for accumulator logic in any environment.
 * Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
 */
export class AccumulatorClient {
	public contractAddress: string
	public config: AccumulatorClientConfig
	public data?: DataNamespace
	public ipfs?: IpfsNamespace
	public storage?: StorageNamespace
	public sync?: SyncNamespace
	public mmr: MerkleMountainRange

	constructor(contractAddress: string, config?: AccumulatorClientConfig) {
		this.contractAddress = contractAddress
		this.config = config ?? defaultConfig
		this.mmr = new MerkleMountainRange()
		logConfig(this.config)
	}

	async init(): Promise<void> {
		// Expose client in browser (to give user control)
		if (isBrowser()) {
			// @ts-ignore
			window.accumulatorClient = this
		}

		// SET UP STORAGE
		this.storage = await initStorage(this.config)
		// Ensure DB is open
		await this.storage.storageAdapter.open()
		// Log how many leaves are in the DB
		const highestLeafIndexInDB = await getHighestContiguousLeafIndexWithData(this.storage.storageAdapter)
		console.log(`[Accumulator] \u{1F4E4} Found ${highestLeafIndexInDB + 1} leafs in DB`)

		// SET UP IPFS
		this.ipfs = await initIpfs(this.config, this.storage.storageAdapter)

		// SET UP SYNC
		this.sync = await initSync(
			this.contractAddress,
			this.config,
			this.storage.storageAdapter,
			this.ipfs,
			this.mmr,
			this.config.GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE,
			this.config.LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE,
		)

		// SET UP DATA (firnedly "front-end" to storage)
		this.data = getDataNamespace(
			this.storage.storageAdapter,
			() => this.sync!.highestCommittedLeafIndex,
			(this.sync!.onNewLeaf).bind(this.sync!)
		)
	}

	async start(): Promise<void> {
		console.log("[Accumulator] 🚀 Starting AccumulatorClient...")
		await this.init()

		if (!this.ipfs || !this.sync || !this.storage)
			throw new Error("Not all namespaces present. This should never happen.")

		await syncBackwardsFromLatest(
			this.ipfs.ipfsAdapter,
			this.storage.storageAdapter,
			this.sync.ethereumHttpRpcUrl,
			this.sync.contractAddress,
			(block: number) => (this.sync!.lastProcessedBlock = block),
			this.config.GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE,
			this.config.LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE,
			this.config.ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL ?? 1000,
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
			this.sync.newLeafSubscribers,
			this.sync.lastProcessedBlock,
			(block: number) => (this.sync!.lastProcessedBlock = block),
			() => this.sync!.highestCommittedLeafIndex,
			(leafIndex: number) => (this.sync!.highestCommittedLeafIndex = leafIndex),
			this.ipfs.shouldPin,
			this.ipfs.shouldProvide,
			this.config.GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE,
			this.config.GET_LATEST_CID_CALLDATA_OVERRIDE,
			this.config.LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE,
		)
		console.log("[Accumulator] 🟢 Completed initialization. Ready to use.")
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
