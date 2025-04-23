import { AccumulatorClient } from "./source/accumulator/AccumulatorClient.ts"
import { config } from "./config.ts";
import { FetchIpfsAdapter } from "./source/adapters/ipfs/FetchIpfsAdapter.ts"
import { registerGracefulShutdown } from "./source/utils/gracefulShutdown.ts"
import { ReadOnlyIpfsAdapter } from "./source/adapters/ipfs/ReadOnlyIpfsAdapter.ts";
import { IpfsAdapter } from "./source/interfaces/IpfsAdapter.ts";
import { isBrowser, isNodeJs } from "./source/utils/envDetection.ts"
import { IndexedDBAdapter } from "./source/adapters/storage/IndexedDBAdapter.ts"
import { BrowserIpfsAdapter } from "./source/adapters/ipfs/BrowserIpfsAdapter.ts";

async function main() {
	// Create an IPFS adapter
	const ipfs: IpfsAdapter = config.IPFS_READ_ONLY
		? new ReadOnlyIpfsAdapter(config.IPFS_API_URL)
		: (isBrowser())
			? new BrowserIpfsAdapter(config.IPFS_API_URL)
			: new FetchIpfsAdapter(config.IPFS_API_URL)

	// Set up storage adapter (see source/adapters/storage for other options, or create your own)
	let storage;
	if (isBrowser()) {
		storage = new IndexedDBAdapter();
	} else {
		const { JSMapAdapter } = await import("./source/adapters/storage/JSMapAdapter.ts");
		storage = new JSMapAdapter(config.DB_PATH ?? `./cid-accumulator-${config.CONTRACT_ADDRESS}.db.json`);
	}

	// Instantiate the node
	const accumulatorClient = new AccumulatorClient({...config, ipfs, storage})

	// Initialize the node (opens the DB and checks Ethereum and IPFS connections)
	await accumulatorClient.init()

	// Register SIGINT handler for graceful shutdown (only applicable in NodeJs environment)
	if (isNodeJs()) registerGracefulShutdown(accumulatorClient)

	// Sync backwards from the latest leaf while simultaneously checking IPFS for older root CIDs
	await accumulatorClient.syncBackwardsFromLatest()


	// Rebuild the Merkle Mountain Range and pin all related data to IPFS
	await accumulatorClient.rebuildAndProvideMMR()

	// (OPTIONAL) Re-pin all data to IPFS
	accumulatorClient.rePinAllDataToIPFS()

	// Start watching the chain for new LeafInsert events to process
	await accumulatorClient.startLiveSync()
}

await main().catch((e) => {
	console.error("\u{274C} Example runner error:", e)
	process.exit(1)
})
