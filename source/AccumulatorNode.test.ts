import "dotenv/config"
import { AccumulatorNode } from "./accumulator/AccumulatorNode.ts"
import { KuboRpcAdapter } from "./adapters/ipfs/KuboRpcAdapter.ts"
// import {MemoryAdapter} from "./adapters/storage/MemoryAdapter.ts"
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
	const db = new Level(LEVEL_PATH)
	const storage = new LevelDbAdapter(db)
	// const storage = new MemoryAdapter()


	// Instantiate the node with fetch-based contract config
	const node = new AccumulatorNode({
		ipfs,
		storage,
		ethereumRpcUrl: RPC_URL,
		contractAddress: CONTRACT_ADDRESS,
	})

	try {
		// 1. Sync backwards
		await node.syncBackwardsFromLatest(1000)
		console.log("[Accumulator TEST] ✅ backwards sync complete!")

		// 2. Commit all uncommitted leaves
		await node.commitAllUncommittedLeaves()
		console.log("[Accumulator TEST] ✅ committed all uncommitted leaves!")

		// 3. Log MMR root CID (base32)
		const localRoot = await node.mmr.rootCIDAsBase32()
		console.log(`[Accumulator TEST] Local MMR root CID (base32): ${localRoot}`)

		// 4. Fetch on-chain latest root CID using minimal ABI and decode as CID
		const ethers = (await import("ethers")).ethers
		const { MINIMAL_ACCUMULATOR_ABI } = await import("./shared/constants.ts")
		const { CID } = await import("multiformats/cid")
		const { ThrottledProvider } = await import("./ethereum/ThrottledProvider.ts")
		const rawProvider = new ethers.JsonRpcProvider(RPC_URL)
		const provider = new ThrottledProvider(rawProvider)
		const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ACCUMULATOR_ABI, provider)
		const onChainRootHex: string = await contract.getLatestCID()
		const onChainRootBytes = Uint8Array.from(Buffer.from(onChainRootHex.replace(/^0x/, ""), "hex"))
		const onChainRootCID = CID.decode(onChainRootBytes)
		const onChainRootBase32 = onChainRootCID.toString()
		console.log(`[Accumulator TEST] On-chain latest root CID: ${onChainRootBase32}`)

		if (localRoot === onChainRootBase32) {
			console.log("[Accumulator TEST] ✅ Local and on-chain root CIDs match!")
		} else {
			console.error("❌ Local and on-chain root CIDs DO NOT MATCH!")
		}

		// 5. Re-pin all data to IPFS and ensure no errors
		await node.rePinAllDataToIPFS()
		console.log("[Accumulator TEST] ✅ Successfully re-pinned all data to IPFS!")
	} catch (e) {
		console.error("❌ AccumulatorNode test failed:", e)
		process.exit(1)
	}
}

main().catch((e) => {
	console.error("❌ Test runner error:", e)
	process.exit(1)
})
