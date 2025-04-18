import "dotenv/config"
import { Pinner } from "./Pinner.ts"
import { ethers } from "ethers"
import { promptUserChoice } from "../shared/userPrompt.ts"
import { create } from "kubo-rpc-client"

async function main() {
	const { contractAddress, ethereumRpcProviderUrl, ipfsApiUrl } = await getPinnerConfig()

	const provider = new ethers.JsonRpcProvider(ethereumRpcProviderUrl)
	const kuboRPC = create({ url: ipfsApiUrl })
	const pinner = await Pinner.init(contractAddress, provider, kuboRPC)

	// Graceful shutdown
	const shutdown = async () => {
		console.log("\n[pinner] Shutting down gracefully...")
		await pinner.stopListeningForEvents()
		await pinner.shutdown?.()
		process.exit(0)
	}
	process.on("SIGINT", shutdown)
	process.on("SIGTERM", shutdown)

	// Initial sync before listening for events
	await pinner.syncForward()

	// Start listening for new events
	await pinner.listenForEvents({mode: "poll"})

	console.log("[pinner] Running pinner service. Press Ctrl+C to exit.")
}

export async function getPinnerConfig(): Promise<{
	contractAddress: string
	ethereumRpcProviderUrl: string
	ipfsApiUrl: string
}> {
	console.log("[debug] getPinnerConfig called")
	// Print a visually clear header for configuration
	console.log("\n==============================================")
	console.log("      CID Accumulator Pinner Configuration")
	console.log("==============================================\n")

	// Gather contract address
	let contractAddress: string
	if (process.env.TARGET_CONTRACT_ADDRESS) {
		contractAddress = process.env.TARGET_CONTRACT_ADDRESS
		console.log(`Contract address loaded from .env: ${contractAddress}`)
	} else {
		contractAddress = await promptUserChoice("Contract address [Ethereum, 0x...]: ", [], false)
	}

	// Gather Ethereum RPC URL
	let ethereumRpcProviderUrl: string
	if (process.env.ETHEREUM_RPC_PROVIDER_URL) {
		ethereumRpcProviderUrl = process.env.ETHEREUM_RPC_PROVIDER_URL
		console.log(`Ethereum RPC URL loaded from .env: ${ethereumRpcProviderUrl}`)
	} else {
		ethereumRpcProviderUrl = await promptUserChoice("Ethereum RPC URL [e.g. https://rpc.ankr.com/...]: ", [], false)
	}

	// Gather IPFS API URL
	let ipfsApiUrl: string
	if (process.env.IPFS_RPC_URL) {
		ipfsApiUrl = process.env.IPFS_RPC_URL
		console.log(`IPFS API URL loaded from .env: ${ipfsApiUrl}`)
	} else {
		ipfsApiUrl = await promptUserChoice("IPFS API URL [e.g. http://127.0.0.1:5001]: ", [], false)
	}

	// Display gathered configuration and prompt for confirmation
	console.log("\n==============================================")
	console.log("         Configuration Summary")
	console.log("==============================================")
	console.log(`Contract address : ${contractAddress}`)
	console.log(`Ethereum RPC URL : ${ethereumRpcProviderUrl}`)
	console.log(`IPFS API URL   : ${ipfsApiUrl}`)
	console.log("==============================================\n")
	const confirmed = await promptUserChoice("Is this configuration correct? (y/n): ", ["y", "n"], false)
	if (confirmed.trim().toLowerCase() !== "y") {
		console.log("Aborting: Please restart and enter the correct configuration.")
		process.exit(1)
	}
	return { contractAddress, ethereumRpcProviderUrl, ipfsApiUrl }
}

main().catch((e) => {
	console.error("[pinner] Fatal error:", e)
	process.exit(1)
})
