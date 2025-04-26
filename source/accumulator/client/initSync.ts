import { AccumulatorClientConfig, IpfsNamespace } from "../../types/types.ts"
import { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { SyncNamespace } from "../../types/types.ts"
import { getSyncNamespace } from "./syncNamespace.ts"
import { getAccumulatorData } from "../../ethereum/commonCalls.ts"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange.ts"

export async function initSync(
	config: AccumulatorClientConfig,
	storageAdapter: StorageAdapter,
	ipfs: IpfsNamespace,
	mmr: MerkleMountainRange,
	getAccumulatorDataCalldataOverride: string | undefined,
	eventTopicOverride: string | undefined,
): Promise<SyncNamespace> {
	// TODO: add support for signature and calldata overrides for getLatestCID, getAccumulatorData, and
	// signature overrides for getLeafInsertLogs and getLeafInsertLogForTargetLeafIndex

	// Check if Ethereum connection is working
	console.log("[Accumulator] \u{1F440} Checking Ethereum connection...")
	let lastProcessedBlock: number = 0
	try {
		const { meta } = await getAccumulatorData({
			ethereumHttpRpcUrl: config.ETHEREUM_HTTP_RPC_URL,
			contractAddress: config.CONTRACT_ADDRESS,
			getAccumulatorDataCalldataOverride: config.GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE,
		})
		console.log(`[Accumulator] \u{2705} Connected to Ethereum. Target contract address: ${config.CONTRACT_ADDRESS}`)
		lastProcessedBlock = meta.deployBlockNumber - 1
	} catch (e) {
		console.error("[Accumulator] \u{274C} Failed to connect to Ethereum node:", e)
		throw new Error("Failed to connect to Ethereum node. See above error.")
	}
	// Initialize a Sync namespace object
	const sync = getSyncNamespace(
		ipfs.ipfsAdapter,
		mmr,
		storageAdapter,
		config.ETHEREUM_HTTP_RPC_URL,
		config.ETHEREUM_WS_RPC_URL,
		config.CONTRACT_ADDRESS,
		lastProcessedBlock,
		ipfs.shouldPut,
		ipfs.shouldPin,
		ipfs.shouldProvide,
		getAccumulatorDataCalldataOverride,
		config.GET_LATEST_CID_CALLDATA_OVERRIDE,
		eventTopicOverride,
	)
	return sync
}
