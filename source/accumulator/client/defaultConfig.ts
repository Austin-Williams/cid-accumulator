import { AccumulatorClientConfig } from "../../types/types.ts";

export const defaultConfig: AccumulatorClientConfig = {
	ETHEREUM_HTTP_RPC_URL: "https://ethereum-rpc.publicnode.com",
	ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL: undefined,
	ETHEREUM_WS_RPC_URL: undefined,
	IPFS_GATEWAY_URL: "https://ipfs.io/ipfs",
	IPFS_API_URL: "http://127.0.0.1:5001",
	IPFS_PUT_IF_POSSIBLE: true,
	IPFS_PIN_IF_POSSIBLE: true,
	IPFS_PROVIDE_IF_POSSIBLE: true,
	DB_PATH: undefined,
	GET_LATEST_CID_CALLDATA_OVERRIDE: undefined,
	GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE: undefined,
	LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE: undefined,
}