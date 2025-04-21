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
	const db = new Level(LEVEL_PATH)
	const storage = new LevelDbAdapter(db)

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

		// 1.5. Check DB leaf data matches submitted-data.json
		const submitted = (await import("../integration/submitted-data.json")).default || (await import("../integration/submitted-data.json"));
		let allMatch = true;
		for (let i = 0; i < submitted.length; i++) {
			const expected = submitted[i];
			const rec = await node.getLeafRecord(i);
			if (!rec) {
				console.error(`[DB CHECK] ❌ Missing leaf record for index ${i}`);
				allMatch = false;
				continue;
			}
			const dbData = rec.newData;
			const expectedData = Buffer.from(expected.randomBytes, "hex");
			if (!(dbData instanceof Uint8Array)) {
				console.error(`[DB CHECK] ❌ newData at index ${i} is not a Uint8Array. Type: ${typeof dbData}, Constructor: ${dbData?.constructor?.name}`);
				allMatch = false;
				continue;
			}
			if (dbData.length !== expectedData.length || !dbData.every((b, j) => b === expectedData[j])) {
				console.error(`[DB CHECK] ❌ Data mismatch at index ${i}`);
				allMatch = false;
			}
		}
		if (allMatch) {
			console.log("[DB CHECK] ✅ All leaf records in DB match submitted-data.json!");
		} else {
			console.error("[DB CHECK] ❌ Some leaf records in DB do NOT match submitted-data.json!");
		}

		// 1.6. Diagnostic: Build MMR from JSON and DB, compare roots
		const { MerkleMountainRange } = await import("./shared/accumulator/MerkleMountainRange.ts");
		const mmrFromJson = new MerkleMountainRange();
		const mmrFromDb = new MerkleMountainRange();
		for (let i = 0; i < submitted.length; i++) {
			const expectedData = Buffer.from(submitted[i].randomBytes, "hex");
			await mmrFromJson.addLeafWithTrail(i, expectedData);
			const rec = await node.getLeafRecord(i);
			await mmrFromDb.addLeafWithTrail(i, rec?.newData);
		}
		console.log(`[DIAG] MMR leaf count from JSON: ${mmrFromJson.leafCount}`);
		console.log(`[DIAG] MMR leaf count from DB:   ${mmrFromDb.leafCount}`);
		const jsonRoot = await mmrFromJson.rootCIDAsBase32();
		const dbRoot = await mmrFromDb.rootCIDAsBase32();
		console.log(`[DIAG] MMR root from JSON: ${jsonRoot}`);
		console.log(`[DIAG] MMR root from DB:   ${dbRoot}`);
		if (jsonRoot === dbRoot) {
			console.log("[DIAG] ✅ MMR roots match!");
		} else {
			console.error("[DIAG] ❌ MMR roots do NOT match!");
		}

		// 2. Commit all uncommitted leaves
		await node.commitAllUncommittedLeaves()
		console.log("[Accumulator TEST] ✅ committed all uncommitted leaves!")

		// 3. Log MMR root CID (base32)
		const localRoot = await node.mmr.rootCIDAsBase32()
		console.log(`[Accumulator TEST] Local MMR root CID (base32): ${localRoot}`)

		// 4. Fetch on-chain latest root CID using minimal ABI and decode as CID
		const ethers = (await import("ethers")).ethers
		const { MINIMAL_ACCUMULATOR_ABI } = await import("./shared/constants.ts");
		const { CID } = await import("multiformats/cid");
		const provider = new ethers.JsonRpcProvider(RPC_URL)
		const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ACCUMULATOR_ABI, provider)
		const onChainRootHex: string = await contract.getLatestCID();
		const onChainRootBytes = Uint8Array.from(Buffer.from(onChainRootHex.replace(/^0x/, ""), "hex"));
		const onChainRootCID = CID.decode(onChainRootBytes);
		const onChainRootBase32 = onChainRootCID.toString();
		console.log(`[Accumulator TEST] On-chain latest root CID: ${onChainRootBase32}`);

		if (localRoot === onChainRootBase32) {
			console.log("[Accumulator TEST] ✅ Local and on-chain root CIDs match!")
		} else {
			console.error("❌ Local and on-chain root CIDs DO NOT MATCH!")
		}
	} catch (e) {
		console.error("❌ AccumulatorNode test failed:", e)
		process.exit(1)
	}
}

main().catch((e) => {
	console.error("❌ Test runner error:", e)
	process.exit(1)
})
