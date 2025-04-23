// Example config.ts - Project configuration
// DO NOT put secrets or private keys here. This file is imported by browser code!
import type { AccumulatorClientConfig } from "./source/types/types.ts"

export const config: AccumulatorClientConfig = {
  ETHEREUM_HTTP_RPC_URL: "http://127.0.0.1:8545",
	ETHEREUM_WS_RPC_URL: undefined, // OPTIONAL: e.g. "ws://..." or "wss://..."
  CONTRACT_ADDRESS: "<YOUR_CONTRACT_ADDRESS>",
  IPFS_API_URL: "http://127.0.0.1:5001", // could also do "https://ipfs.io/ipfs/"
	IPFS_READ_ONLY: false, // Set to true if you do not want to pin data to IPFS
  DB_PATH: undefined // OPTIONAL: e.g. "./db.json"
}
