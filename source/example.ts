import "dotenv/config"
import { create as createKuboClient } from "kubo-rpc-client"
import { Level } from "level"

import { AccumulatorClient } from "./accumulator/AccumulatorClient.ts"
import { KuboRpcAdapter } from "./adapters/ipfs/KuboRpcAdapter.ts"
import { LevelDbAdapter } from "./adapters/storage/LevelDbAdapter.ts"
import { registerGracefulShutdown } from "./utils/gracefulShutdown.ts"

// --- CONFIGURE THESE FOR YOUR ENVIRONMENT (See .env.example) ---
const ETHEREUM_HTTP_RPC_URL = process.env.ETHEREUM_HTTP_RPC_URL || "http://127.0.0.1:8545"
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "<YOUR_CONTRACT_ADDRESS>"
const IPFS_API_URL = process.env.IPFS_API_URL || "http://127.0.0.1:5001" // default Kubo daemon
const LEVEL_PATH = process.env.LEVEL_PATH || "./test.leveldb" // default LevelDB path

async function main() {
	// Set up Kubo IPFS adapter (see source/adapters/ipfs for other options, or create your own)
	const kuboClient = createKuboClient(IPFS_API_URL)
	const ipfs = new KuboRpcAdapter(kuboClient)
	
	// Set uo storage adapter (see source/adapters/storage for other options, or create your own)
	const db = new Level(LEVEL_PATH)
	const storage = new LevelDbAdapter(db)

	// Instantiate the node
	const AccumulatorClient = new AccumulatorClient({
		ipfs,
		storage,
		ethereumHttpRpcUrl: ETHEREUM_HTTP_RPC_URL,
		contractAddress: CONTRACT_ADDRESS,
	})

	// Initialize the node (opens the DB and checks Ethereum and IPFS connections)
	await AccumulatorClient.init()

	// Sync backwards from the latest leaf insert
	// This simultaneously checks IPFS for older root CIDs as they are discovered
	await AccumulatorClient.syncBackwardsFromLatest()

	// Rebuild the Merkle Mountain Range and pin all related data to IPFS
	await AccumulatorClient.rebuildAndProvideMMR()

	// Start watching the chain for new LeafInsert events to process
	await AccumulatorClient.startLiveSync()
	
	// (OPTIONAL) Register SIGINT handler for graceful shutdown
	registerGracefulShutdown(AccumulatorClient)
}

await main().catch((e) => {
	console.error("\u{274C} Example runner error:", e)
	process.exit(1)
})
