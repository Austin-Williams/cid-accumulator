import { promptUserChoice } from "../shared/userPrompt.js"
import "dotenv/config"
import { Pinner } from "./Pinner.js"
import { ethers } from "ethers"
import { getAccumulatorData } from "../shared/accumulator.js"

async function main() {
	const { contractAddress, provider } = await getContractAddressAndProvider()
	const pinner = await Pinner.init(contractAddress, provider)
	const userChoice = await handlePinnerSyncMenu(pinner, provider, contractAddress)
	switch (userChoice) {
		case 'abort':
			console.log("Aborting operation.")
			return
		case 'sync forward':
			// TODO: get latest block number from provider
			// Then syncForward await pinner.syncForward(provider, contractAddress)
			return
		case 'check ipfs':
			// TODO
			return
		case 'process live events':
			// TODO
			return
	}
}

async function handlePinnerSyncMenu(pinner: Pinner, provider: ethers.JsonRpcProvider, contractAddress: string): Promise<'abort' | 'sync forward' | 'check ipfs' | 'process live events'> {
	// see how far ahead the accumulator is from the pinner
	const accData = await getAccumulatorData(provider, contractAddress)
	console.log(`Latest leaf index on-chain: ${accData.leafCount}`)
	console.log(`You are ${accData.leafCount - (pinner.syncedToLeafIndex ?? 0)} behind.`)

	const answer = await promptUserChoice(
		"Options:\n" +
			"1. Sync from here\n" +
			"2. Check for more recent data pinned to IPFS\n" +
			"3. Start processing live events\n" +
			"4. Abort\n" +
			"Enter your choice (1/2/3/4): ",
		["1", "2", "3", "4"],
	)
	// Confirm user choice before proceeding
	const { promptYesNo } = await import("../shared/userPrompt.js")
	const confirmed = await promptYesNo(`You chose option ${answer}. Are you sure you want to proceed?`)
	if (!confirmed || answer == '4') return 'abort'
	if (answer == '1') return 'sync forward'
	if (answer == '2') return 'check ipfs'
	if (answer == '3') return 'process live events'
	return 'abort'
}

async function getContractAddressAndProvider() {
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

	const provider = new ethers.JsonRpcProvider(providerUrl)
	return { contractAddress, provider }
}

main()
