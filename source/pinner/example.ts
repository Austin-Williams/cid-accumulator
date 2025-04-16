import { promptUserChoice } from "../shared/userPrompt.js"
import "dotenv/config"
import { Pinner } from "./Pinner.js"
import { ethers } from "ethers"
import { getAccumulatorData } from "../shared/accumulator.js"

async function main() {
	// prompt user for target contract and provider url
	let contractAddress = process.env.TARGET_CONTRACT_ADDRESS?.trim()
	if (!contractAddress) {
		console.log("No TARGET_CONTRACT_ADDRESS found in environment variables.")
		contractAddress = await promptUserChoice("Enter the target contract address: ", [], false)
	} else {
		console.log(`Using contract address from environment variable: ${contractAddress}`)
	}
	if (!(contractAddress && contractAddress.startsWith("0x") && contractAddress.length === 42)) {
		throw new Error("Invalid Ethereum address.")
	}

	let providerUrl = process.env.RPC_PROVIDER_URL?.trim()
	if (!providerUrl) {
		console.log("No RPC_PROVIDER_URL found in environment variables.")
		providerUrl = await promptUserChoice("Enter the provider URL (default: 'http://127.0.0.1:8545'): ", [], false)
		providerUrl = providerUrl.trim() || "http://127.0.0.1:8545"
	} else {
		console.log(`Using provider URL from environment variable: ${providerUrl}`)
	}

	// set up the pinner
	const provider = new ethers.JsonRpcProvider(providerUrl)
	const pinner = await Pinner.init(contractAddress, provider)
	await pinner.prepareDB()
	console.log(`Pinner has synced up to leaf index ${pinner.syncedToLeafIndex}`)

	// see how far ahead the accumulator is from the pinner
	const accData = await getAccumulatorData(provider, contractAddress)
	console.log(`Latest leaf index on-chain: ${accData.leafCount}`)
	console.log(`You are ${accData.leafCount - (pinner.syncedToLeafIndex ?? 0)} behind.`)

	if (pinner.syncedToLeafIndex! < accData.leafCount) {
		const answer = await promptUserChoice(
			"Options:\n" +
				"1. Sync from here\n" +
				"2. Check for more recent data pinned to IPFS\n" +
				"3. Abort\n" +
				"Enter your choice (1/2/3): ",
			["1", "2", "3"],
		)

		// Confirm user choice before proceeding
		const { promptYesNo } = await import("../shared/userPrompt.js")
		const confirmed = await promptYesNo(`You chose option ${answer}. Are you sure you want to proceed?`)
		if (!confirmed) {
			console.log("Aborting operation.")
			process.exit(0)
		}

		if (answer === "1") {
			console.log("Syncing from current index...")
			// TODO: Add sync logic here
			// Example: await pinner.syncForward(/* args */)
		} else if (answer === "2") {
			console.log("Checking for more recent data on IPFS...")
			// TODO: Add IPFS check logic here
		} else {
			console.log("Aborting operation.")
			process.exit(0)
		}
	} else {
		// TODO: Start watching for new events
	}
}

main()
