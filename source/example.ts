import "dotenv/config"
// import { Level } from "level"

import { AccumulatorClient } from "./accumulator/AccumulatorClient.ts"
import type { AccumulatorClientConfig } from "./types/types.ts"
import { FetchIpfsAdapter } from "./adapters/ipfs/FetchIpfsAdapter.ts"
import { JSMapAdapter } from "./adapters/storage/JSMapAdapter.ts"
import { registerGracefulShutdown } from "./utils/gracefulShutdown.ts"

// --- CONFIGURE THESE FOR YOUR ENVIRONMENT (See .env.example) ---
const config: AccumulatorClientConfig = {
	ETHEREUM_HTTP_RPC_URL: process.env.ETHEREUM_HTTP_RPC_URL || "http://127.0.0.1:8545",
	CONTRACT_ADDRESS: process.env.CONTRACT_ADDRESS || "<YOUR_CONTRACT_ADDRESS>",
	IPFS_API_URL: process.env.IPFS_API_URL || "http://127.0.0.1:5001",
	ETHEREUM_WS_RPC_URL: process.env.ETHEREUM_WS_RPC_URL // optional
}
const DB_PATH = process.env.DB_PATH || "./test.jsmapdb.json" // default JSMapAdapter path

async function main() {
	// Set up fetch-based IPFS adapter (see source/adapters/ipfs for other options, or create your own)
	const ipfs = new FetchIpfsAdapter(config.IPFS_API_URL)

	// Set up storage adapter (see source/adapters/storage for other options, or create your own)
	const storage = new JSMapAdapter(DB_PATH)

	// Instantiate the node
	const accumulatorClient = new AccumulatorClient({...config, ipfs, storage})

	// Initialize the node (opens the DB and checks Ethereum and IPFS connections)
	await accumulatorClient.init()

	// (OPTIONAL) Register SIGINT handler for graceful shutdown
	registerGracefulShutdown(accumulatorClient)

	// Sync backwards from the latest leaf insert
	// This simultaneously checks IPFS for older root CIDs as they are discovered
	await accumulatorClient.syncBackwardsFromLatest()

	// Rebuild the Merkle Mountain Range and pin all related data to IPFS
	await accumulatorClient.rebuildAndProvideMMR()

	// (OPTIONAL) Re-pin all data to IPFS
	await accumulatorClient.rePinAllDataToIPFS()

	// Start watching the chain for new LeafInsert events to process
	await accumulatorClient.startLiveSync()
}

await main().catch((e) => {
	console.error("\u{274C} Example runner error:", e)
	process.exit(1)
})
