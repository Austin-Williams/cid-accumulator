import { AccumulatorClient } from "./source/accumulator/client/AccumulatorClient.ts"
import { config } from "./config.ts";import { registerGracefulShutdown } from "./source/utils/gracefulShutdown.ts"
import { isNodeJs } from "./source/utils/envDetection.ts"

async function main() {	
	// Create the client
	const accumulatorClient = new AccumulatorClient(config)
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
