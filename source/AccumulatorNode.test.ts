import "dotenv/config"
import { AccumulatorNode } from "./AccumulatorNode.ts"
import { KuboRpcAdapter } from "./adapters/ipfs/KuboRpcAdapter.ts"
import { LevelDbAdapter } from "./adapters/storage/LevelDbAdapter.ts"
import { create as createKuboClient } from "kubo-rpc-client"
import { Level } from "level"

// --- CONFIGURE THESE FOR YOUR ENVIRONMENT ---
const RPC_URL = process.env.ETHEREUM_RPC_PROVIDER_URL || "<YOUR_RPC_URL>"
const CONTRACT_ADDRESS = process.env.TARGET_CONTRACT_ADDRESS || "<YOUR_CONTRACT_ADDRESS>"
const IPFS_API_URL = process.env.IPFS_API_URL || "http://127.0.0.1:5001" // default Kubo daemon
const LEVEL_PATH = process.env.LEVEL_PATH || "./test.leveldb" // default LevelDB path

async function main() {
	// Set up Kubo IPFS adapter
	const kuboClient = createKuboClient(IPFS_API_URL)
	const ipfs = new KuboRpcAdapter(kuboClient)
	const db = new Level(LEVEL_PATH, { valueEncoding: "json" })
	const storage = new LevelDbAdapter(db)

	// Instantiate the node with fetch-based contract config
	const node = new AccumulatorNode({
		ipfs,
		storage,
		ethereumRpcUrl: RPC_URL,
		contractAddress: CONTRACT_ADDRESS,
	})

	// Run the backwards sync
	try {
		await node.syncBackwardsFromLatest(1000)
		console.log("✅ AccumulatorNode backwards sync complete!")
	} catch (e) {
		console.error("❌ AccumulatorNode sync failed:", e)
		process.exit(1)
	}
}

main().catch((e) => {
	console.error("❌ Test runner error:", e)
	process.exit(1)
})
