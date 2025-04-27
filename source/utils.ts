import { keccak_256 } from "@noble/hashes/sha3"
import { AccumulatorClient } from "cid-accumulator-client"

// Compute the selector
function getSelector(signature: string): string {
	const hash = keccak_256(new TextEncoder().encode(signature))
	// First 4 bytes (8 hex chars)
	return Array.from(hash)
		.slice(0, 4)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.toLowerCase()
}

// Left-pad address to 32 bytes (64 hex chars)
function leftPadAddress(address: string): string {
	let clean = address.startsWith("0x") ? address.slice(2) : address
	if (clean.length !== 40) throw new Error("Invalid address length")
	const result = clean.padStart(64, "0")
	return result.toLowerCase()
}

export function overrideForGetLeafInsertEventSignature(address: string): string {
	const result = "0x" + leftPadAddress(address)
	console.log(`Leaf insert event signature override: ${result}`)
	return result.toLowerCase()
}

// Combine selector and argument
export function overrideForGetLatestCIDCalldata(address: string): string {
	const selector = getSelector("getLatestCID(address)")
	const arg = leftPadAddress(address)
	const result = "0x" + selector + arg
	console.log(`Latest CID calldata override: ${result}`)
	return result.toLowerCase()
}

// Combine selector and argument
export function overrideForGetAccumulatorDataCalldata(address: string): string {
	const selector = getSelector("getAccumulatorData(address)")
	const arg = leftPadAddress(address)
	const result = "0x" + selector + arg
	console.log(`Accumulator data calldata override: ${result}`)
	return result.toLowerCase()
}

/**
 * Returns true if running in a browser (window, document, navigator are defined).
 */
export function isBrowser(): boolean {
	return typeof window !== "undefined" && typeof window.document !== "undefined"
}

/**
 * Returns true if running in Node.js (process, global, require are defined).
 */
export function isNodeJs(): boolean {
	return typeof process !== "undefined" && !!(process.versions && process.versions.node)
}

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
