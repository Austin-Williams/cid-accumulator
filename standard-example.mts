import { AccumulatorClient } from "cid-accumulator-client"
import { config } from "./config.ts"
import { isNodeJs, registerGracefulShutdown } from "./source/utils.ts"

async function main() {
	const customConfig = {...config}
	customConfig.DB_PATH = './.db/standard-example.json'
	
	// Create the client
	const contractAddress = "0xeCeaA1254fB90e15B1A73C361562BF075d328a66"
	const accumulatorClient = new AccumulatorClient(contractAddress, customConfig)
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
