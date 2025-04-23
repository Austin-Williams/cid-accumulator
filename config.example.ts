// Example config.ts - Project configuration
// DO NOT put secrets or private keys here. This file is imported by browser code!
// Copy this file to `config.ts` and fill in the required values for your deployment.
import type { AccumulatorClientConfig } from "./source/types/types.ts"

export const config: AccumulatorClientConfig = {
	// The HTTP endpoint for your Ethereum node or provider.
	// Example: "https://mainnet.infura.io/v3/<YOUR_INFURA_KEY>"
	// Required for all on-chain operations.
	ETHEREUM_HTTP_RPC_URL: "<YOUR_ETHEREUM_RPC_URL>",

	// (Optional) WebSocket endpoint for Ethereum. Used for real-time event subscriptions.
	// If left undefined, will fallback to HTTP polling.
	// Example: "wss://mainnet.infura.io/ws/v3/<YOUR_INFURA_KEY>"
	ETHEREUM_WS_RPC_URL: undefined,

	// The deployed address of your CIDAccumulator smart contract.
	// Example: "0x1234abcd5678ef..."
	CONTRACT_ADDRESS: "<YOUR_CONTRACT_ADDRESS>",

	// The public or local IPFS gateway to fetch content from.
	// Example (local): "http://127.0.0.1:8080"
	// Example (public): "https://ipfs.io/ipfs"
	IPFS_GATEWAY_URL: "https://ipfs.io/ipfs",

	// (Optional) The IPFS API endpoint for advanced operations (PUT, PIN, PROVIDE).
	// This is only relevant if you want to use your own IPFS node (like IPFS Desktop).
	// Example (local): "http://127.0.0.1:5001"
	// Leave as `undefined` if you don't want to store the data on your own IPFS node.
	IPFS_API_URL: undefined,

	// Set to `true` to allow uploading (PUT) data to the IPFS node via the API.
	// Set to `false` to disable all writes to IPFS (read-only mode).
	// This value is ignored if `IPFS_API_URL` is `undefined`.
	IPFS_PUT_IF_POSSIBLE: true,

	// Set to `true` to pin data after uploading to IPFS.
	// Set to `false` to skip pinning (data may be garbage-collected).
	// This value is ignored if `IPFS_API_URL` is `undefined`.
	// Has no effect if IPFS_PUT_IF_POSSIBLE is `false`. (It doesn't make sense to PIN without PUT)
	IPFS_PIN_IF_POSSIBLE: true,

	// Set to `true` to advertise (PROVIDE) blocks to the IPFS DHT after pinning.
	// Set to `false` to skip providing.
	// This value is ignored if `IPFS_API_URL` is `undefined`.
	// Has no effect if IPFS_PIN_IF_POSSIBLE is `false`.
	IPFS_PROVIDE_IF_POSSIBLE: true,

	// (Optional, Node.js only) Path to the local DB file for storing leaves and metadata.
	// Example: "./myDB.json"
	// Leave as `undefined` to use the default path.
	// The default path is "./cid-accumulator-<CONTRACT_ADDRESS>.db.json"
	DB_PATH: undefined
}
