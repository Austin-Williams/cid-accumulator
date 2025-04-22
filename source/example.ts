import "dotenv/config"
import { Level } from "level"

import { AccumulatorClient } from "./accumulator/AccumulatorClient.ts"
import { FetchIpfsAdapter } from "./adapters/ipfs/FetchIpfsAdapter.ts"
import { LevelDbAdapter } from "./adapters/storage/LevelDbAdapter.ts"
import { registerGracefulShutdown } from "./utils/gracefulShutdown.ts"

// --- CONFIGURE THESE FOR YOUR ENVIRONMENT (See .env.example) ---
const ETHEREUM_HTTP_RPC_URL = process.env.ETHEREUM_HTTP_RPC_URL || "http://127.0.0.1:8545"
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "<YOUR_CONTRACT_ADDRESS>"
const IPFS_API_URL = process.env.IPFS_API_URL || "http://127.0.0.1:5001" // default Kubo daemon
const LEVEL_PATH = process.env.LEVEL_PATH || "./test.leveldb" // default LevelDB path

async function main() {
	// Set up fetch-based IPFS adapter (see source/adapters/ipfs for other options, or create your own)
	const ipfs = new FetchIpfsAdapter(IPFS_API_URL)

	// Set up storage adapter (see source/adapters/storage for other options, or create your own)
	const db = new Level(LEVEL_PATH)
	const storage = new LevelDbAdapter(db)

	// Instantiate the node
	const accumulatorClient = new AccumulatorClient({
		ipfs,
		storage,
		ethereumHttpRpcUrl: ETHEREUM_HTTP_RPC_URL,
		contractAddress: CONTRACT_ADDRESS,
	})

	// Initialize the node (opens the DB and checks Ethereum and IPFS connections)
	await accumulatorClient.init()

	// (OPTIONAL) Register SIGINT handler for graceful shutdown
	registerGracefulShutdown(accumulatorClient)

	// Sync backwards from the latest leaf insert
	// This simultaneously checks IPFS for older root CIDs as they are discovered
	await accumulatorClient.syncBackwardsFromLatest()

	// Rebuild the Merkle Mountain Range and pin all related data to IPFS
	await accumulatorClient.rebuildAndProvideMMR()

	// Start watching the chain for new LeafInsert events to process
	await accumulatorClient.startLiveSync()
}

await main().catch((e) => {
	console.error("\u{274C} Example runner error:", e)
	process.exit(1)
})
