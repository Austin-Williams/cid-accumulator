import { AccumulatorClient } from "../accumulator/client/AccumulatorClient.ts"
import { isNodeJs, isBrowser } from "./envDetection.ts"

export function registerGracefulShutdown(node: AccumulatorClient) {
	let shuttingDown = false

	if (isNodeJs()) {
		process.on("SIGINT", async () => {
			if (shuttingDown) return
			shuttingDown = true
			console.log("\nCaught SIGINT (Ctrl+C). Shutting down gracefully...")
			await node.shutdown()
			console.log("Graceful shutdown complete. Exiting.")
			process.exit(0)
		})
	}

	if (isBrowser() && typeof window !== "undefined") {
		window.addEventListener("beforeunload", () => {
			if (shuttingDown) return
			shuttingDown = true
			// Best effort: call shutdown synchronously if possible
			if (typeof node.shutdown === "function") {
				// If shutdown is async, this won't always finish, but we try
				node.shutdown()
			}
		})
	}
}
