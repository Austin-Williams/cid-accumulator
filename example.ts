import type { IpfsAdapter } from "./source/interfaces/IpfsAdapter.ts"
import type { StorageAdapter } from "./source/interfaces/StorageAdapter.ts"

import { AccumulatorClient } from "./source/accumulator/client/AccumulatorClient.ts"
import { config } from "./config.ts";import { registerGracefulShutdown } from "./source/utils/gracefulShutdown.ts"
import { isBrowser, isNodeJs } from "./source/utils/envDetection.ts"
import { IndexedDBAdapter } from "./source/adapters/storage/IndexedDBAdapter.ts"
import { UniversalIpfsAdapter } from "./source/adapters/ipfs/UniversalIpfsAdapter.ts";

async function main() {
	// Create an IPFS adapter
	const ipfs: IpfsAdapter = new UniversalIpfsAdapter(
		config.IPFS_GATEWAY_URL,
		config.IPFS_API_URL,
		config.IPFS_PUT_IF_POSSIBLE,
		config.IPFS_PIN_IF_POSSIBLE,
		config.IPFS_PROVIDE_IF_POSSIBLE
	)

	// Create a Storage adapter appropriate for your environment (e.g. IndexedDBAdapter for browser, JSMapAdapter for NodeJs)
	let storage: StorageAdapter
	if (isBrowser()) {
		storage = new IndexedDBAdapter();
	} else {
		const { JSMapAdapter } = await import("./source/adapters/storage/JSMapAdapter.ts");
		storage = new JSMapAdapter(config.DB_PATH);
	}

	// Create the client
	const accumulatorClient = new AccumulatorClient({...config, ipfs, storage})

	// (Optional) Register SIGINT handler for graceful shutdown in NodeJs
	if (isNodeJs()) registerGracefulShutdown(accumulatorClient)

	// Start the client
	await accumulatorClient.start()

	// Keep the process running if in NodeJs (not needed in browser)
	if (isNodeJs()) {
		console.log("[Accumulator] Running in persistent mode. Press Ctrl+C to exit.");
		await new Promise(() => {})
	}
}

await main().catch((e) => {
	console.error("\u{274C} Example runner error:", e)
	process.exit(1)
})
