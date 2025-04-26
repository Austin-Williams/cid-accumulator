import type { AccumulatorClientConfig } from "../types/types.ts"

export function logConfig(config: AccumulatorClientConfig) {
	console.log(`[Accumulator] ⚙ Config: ETHEREUM_HTTP_RPC_URL: ${config.ETHEREUM_HTTP_RPC_URL}`)
	console.log(`[Accumulator] ⚙ Config: ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL: ${config.ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL ?? "undefined"}`)
	console.log(`[Accumulator] ⚙ Config: ETHEREUM_WS_RPC_URL: ${config.ETHEREUM_WS_RPC_URL ?? "undefined"}`)
	console.log(`[Accumulator] ⚙ Config: CONTRACT_ADDRESS: ${config.CONTRACT_ADDRESS}`)
	console.log(`[Accumulator] ⚙ Config: IPFS_GATEWAY_URL: ${config.IPFS_GATEWAY_URL}`)
	console.log(`[Accumulator] ⚙ Config: IPFS_API_URL: ${config.IPFS_API_URL ?? "undefined"}`)
	console.log(`[Accumulator] ⚙ Config: IPFS_PUT_IF_POSSIBLE: ${config.IPFS_PUT_IF_POSSIBLE}`)
	console.log(`[Accumulator] ⚙ Config: IPFS_PIN_IF_POSSIBLE: ${config.IPFS_PIN_IF_POSSIBLE}`)
	console.log(`[Accumulator] ⚙ Config: IPFS_PROVIDE_IF_POSSIBLE: ${config.IPFS_PROVIDE_IF_POSSIBLE}`)
	console.log(`[Accumulator] ⚙ Config: DB_PATH: ${config.DB_PATH ?? "undefined"}`)
	console.log(`[Accumulator] ⚙ Config: GET_LATEST_CID_CALLDATA_OVERRIDE: ${config.GET_LATEST_CID_CALLDATA_OVERRIDE ?? "undefined"}`)
	console.log(`[Accumulator] ⚙ Config: GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE: ${config.GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE ?? "undefined"}`)
	console.log(`[Accumulator] ⚙ Config: LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE: ${config.LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE ?? "undefined"}`)
}
