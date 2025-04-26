import type { AccumulatorClientConfig } from "./source/types/types.ts"
import { AccumulatorClient } from "./source/accumulator/client/AccumulatorClient.ts"
import { registerGracefulShutdown } from "./source/utils/gracefulShutdown.ts"
import { isNodeJs } from "./source/utils/envDetection.ts"

// Load config.json dynamically
// After loading config
const config = await import("./config.json").then(m => m.default ?? m) as AccumulatorClientConfig
async function main() {	
	// Create the client
	const contractAddress = "0x7BD24761E84a9003B346168B5F84FC2045b60E0e"
	const accumulatorClient = new AccumulatorClient(contractAddress, config)
	// Start the client
	await accumulatorClient.start()

	if (isNodeJs()) {
		// (Optional) Register SIGINT handler for graceful shutdown in NodeJs (not needed in browser)
		registerGracefulShutdown(accumulatorClient)
		// Keep the process running if in NodeJs (not needed in browser)
		console.log("[Accumulator] Running in persistent mode. Press Ctrl+C to exit.");
		await new Promise(() => {})
	}
}

await main().catch((e) => {
	console.error("\u{274C} Example runner error:", e)
	process.exit(1)
})
