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

export function overrideForGetLeafAppendedEventSignature(address: string): string {
	const result = "0x" + leftPadAddress(address)
	console.log(`LeafAppended event signature override: ${result}`)
	return result.toLowerCase()
}

// Combine selector and argument
export function overrideForGetRootCIDCalldata(address: string): string {
	const selector = getSelector("getRootCID(address)")
	const arg = leftPadAddress(address)
	const result = "0x" + selector + arg
	console.log(`getRootCID calldata override: ${result}`)
	return result.toLowerCase()
}

// Combine selector and argument
export function overrideForGetStateCalldata(address: string): string {
	const selector = getSelector("getState(address)")
	const arg = leftPadAddress(address)
	const result = "0x" + selector + arg
	console.log(`getState calldata override: ${result}`)
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

import readline from "readline/promises"

/**
 * Prompts the user for a yes/no answer. Accepts 'y', 'yes', 'n', 'no' (case-insensitive).
 * Returns true for yes, false for no.
 */
export async function promptYesNo(question: string): Promise<boolean> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	const prompt = question.trim().replace(/[\s:]+$/, "") + " (y/n): "
	while (true) {
		const answer = (await rl.question(prompt)).trim().toLowerCase()
		if (answer === "y" || answer === "yes") {
			rl.close()
			return true
		}
		if (answer === "n" || answer === "no") {
			rl.close()
			return false
		}
		console.log("Please answer 'y' or 'n'.")
	}
}

/**
 * Prompts the user for a value. If acceptableValues is non-empty, only accepts those values.
 * If acceptableValues is empty and abortOnInvalid is false, returns any user input (free-form).
 * If abortOnInvalid is true, aborts on invalid input. Otherwise, re-prompts.
 */
export async function promptUserChoice(
	question: string,
	acceptableValues: string[],
	abortOnInvalid: boolean = true,
): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	while (true) {
		const answer = (await rl.question(question)).trim()
		if (acceptableValues.length === 0 && abortOnInvalid === false) {
			rl.close()
			return answer
		}
		if (acceptableValues.includes(answer)) {
			rl.close()
			return answer
		} else {
			console.log(`Invalid input. Acceptable values are: ${acceptableValues.join(", ")}`)
			if (abortOnInvalid) {
				rl.close()
				console.log("Invalid input. Aborting.")
				process.exit(1)
			}
			// Otherwise, re-prompt
		}
	}
}
