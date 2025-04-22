import "dotenv/config"
import { AccumulatorNode } from "./accumulator/AccumulatorNode.ts"
import { KuboRpcAdapter } from "./adapters/ipfs/KuboRpcAdapter.ts"
// import {MemoryAdapter} from "./adapters/storage/MemoryAdapter.ts"
import { LevelDbAdapter } from "./adapters/storage/LevelDbAdapter.ts"
import { create as createKuboClient } from "kubo-rpc-client"
import { Level } from "level"

import { getLatestCID } from "./ethereum/commonCalls.ts"

// --- CONFIGURE THESE FOR YOUR ENVIRONMENT ---
const RPC_URL = process.env.ETHEREUM_HTTP_RPC_URL || "<YOUR_RPC_URL>"
const CONTRACT_ADDRESS = process.env.TARGET_CONTRACT_ADDRESS || "<YOUR_CONTRACT_ADDRESS>"
const IPFS_API_URL = process.env.IPFS_API_URL || "http://127.0.0.1:5001" // default Kubo daemon
const LEVEL_PATH = process.env.LEVEL_PATH || "./test.leveldb" // default LevelDB path


async function main() {
	// Confirm the canonical dag-cbor empty CID
	const emptyDagCborCid = await ()
	console.log(`[Accumulator TEST] Canonical dag-cbor empty CID: ${emptyDagCborCid.toString()} (codec code: ${emptyDagCborCid.code})`)

	// Set up Kubo IPFS adapter
	const kuboClient = createKuboClient(IPFS_API_URL)
	const ipfs = new KuboRpcAdapter(kuboClient)
	const db = new Level(LEVEL_PATH)
	const storage = new LevelDbAdapter(db)
	// const storage = new MemoryAdapter()

	// Instantiate the node with fetch-based contract config
	const node = new AccumulatorNode({
		ipfs,
		storage,
		ethereumHttpRpcUrl: RPC_URL,
		contractAddress: CONTRACT_ADDRESS,
	})

	// Register SIGINT handler for graceful shutdown
	let shuttingDown = false
	process.on("SIGINT", async () => {
		if (shuttingDown) return
		shuttingDown = true
		console.log("\n[Accumulator TEST] Caught SIGINT (Ctrl+C). Shutting down gracefully...")
		try {
			await node.shutdown()
			console.log("[Accumulator TEST] Graceful shutdown complete. Exiting.")
		} catch (err) {
			console.error("[Accumulator TEST] Error during shutdown:", err)
		} finally {
			process.exit(0)
		}
	})

	try {
		// 1. Sync backwards
		await node.syncBackwardsFromLatest(1000)
		console.log("[Accumulator TEST] ✅ backwards sync complete!")

		// 2. Commit all uncommitted leaves
		await node.commitAllUncommittedLeaves()
		console.log("[Accumulator TEST] ✅ committed all uncommitted leaves!")

		const localRootCid = await node.mmr.rootCIDAsBase32();
		const onChainRootCid = await getLatestCID(RPC_URL, CONTRACT_ADDRESS);
		console.log(`[Accumulator TEST] Local MMR root CID (base32): ${localRootCid}`);
		console.log(`[Accumulator TEST] On-chain latest root CID: ${onChainRootCid}`);
		if (localRootCid !== onChainRootCid.toString()) throw new Error("Local and on-chain root CIDs do not match!");
		console.log("[Accumulator TEST] ✅ Local and on-chain root CIDs match!");
		await node.rePinAllDataToIPFS();
		// Start live sync and keep test running for user-submitted txs
		console.log("[Accumulator TEST] About to start live sync...");
		await node.startLiveSync();
		console.log("[Accumulator TEST] Live sync started. Waiting for transactions...");
		console.log("[Accumulator TEST] Live sync running indefinitely. Submit transactions now. Press Ctrl+C to stop the test when finished.");
		await new Promise(() => {}); // Keeps process alive until manually killed
	} catch (e) {
		console.error("❌ AccumulatorNode test failed:", e)
		if (e instanceof Error && e.stack) {
			console.error(e.stack)
		}
		process.exit(1)
	}
}

await main().catch((e) => {
	console.error("❌ Test runner error:", e)
	process.exit(1)
})
