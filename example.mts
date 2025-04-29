import { AccumulatorClient } from "cid-accumulator-client"
import { config } from "./config.ts"
import { isNodeJs, registerGracefulShutdown } from "./source/utils.ts"

async function main() {
	const customConfig = {...config}
	customConfig.DB_PATH = './.db/standard-example.json'
	
	// Create the client
	const contractAddress = "0x7e71DE0438F287F229Be5d714164106473d39E41"
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
