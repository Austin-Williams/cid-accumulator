// Example config.ts - Project configuration
// DO NOT put secrets or private keys here. This file is imported by browser code!
import type { AccumulatorClientConfig } from "./source/types/types";

export const config: AccumulatorClientConfig = {
  ETHEREUM_HTTP_RPC_URL: "http://127.0.0.1:8545",
  CONTRACT_ADDRESS: "<YOUR_CONTRACT_ADDRESS>",
  IPFS_API_URL: "http://127.0.0.1:5001",
  ETHEREUM_WS_RPC_URL: undefined // Optional. "ws://..." or "wss://..."
};
