import { AccumulatorClient } from "../accumulator/AccumulatorClient.ts"

export function registerGracefulShutdown(node: AccumulatorClient) {
	let shuttingDown = false
	process.on("SIGINT", async () => {
		if (shuttingDown) return
		shuttingDown = true
		console.log("\nCaught SIGINT (Ctrl+C). Shutting down gracefully...")
		await node.shutdown()
		console.log("Graceful shutdown complete. Exiting.")
		process.exit(0)
	})
}
