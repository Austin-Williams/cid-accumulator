// npx tsx integration/submit-random-data.ts

import "dotenv/config"
import { ethers } from "ethers"
import { promptUserChoice } from "../source/shared/userPrompt.js"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DELAY_SECONDS = 30 // Delay in seconds between submissions
const CONTRACT_ABI_PATH = path.resolve(__dirname, "../source/contracts/abi/OwnedExample.json")
const OUTPUT_PATH = path.resolve(__dirname, "./submitted-data.json")

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
	let contractAddress = process.env.TARGET_CONTRACT_ADDRESS
	let providerUrl = process.env.ETHEREUM_RPC_PROVIDER_URL
	let mnemonic = process.env.MNEMONIC_FOR_SUBMITTER

	if (!contractAddress) {
		contractAddress = await promptUserChoice("Enter the target contract address: ", [], false)
	} else {
		console.log("Found contract address from environment variable.")
	}
	if (!ethers.isAddress(contractAddress)) {
		throw new Error("Invalid Ethereum address for contract.")
	}
	contractAddress = contractAddress.toLowerCase()
	if (!providerUrl) {
		providerUrl = await promptUserChoice("Enter the provider URL (e.g. Sepolia endpoint): ", [], false)
	} else {
		console.log("Found provider URL from environment variable")
	}
	if (!mnemonic) {
		mnemonic = await promptUserChoice("Enter the mnemonic for the submitter (deployer/owner) wallet: ", [], false)
	} else {
		console.log("Found mnemonic from environment variable.")
	}

	console.log("--- Integration Script Configuration ---")
	console.log("Contract Address:", contractAddress)
	console.log("Provider URL:", providerUrl)
	const wallet = ethers.Wallet.fromPhrase(mnemonic)
	const submitterAddress = await wallet.getAddress()
	console.log("Submitter Wallet Address:", submitterAddress)

	// Use the shared yes/no prompt for confirmation
	const { promptYesNo } = await import("../source/shared/userPrompt.js")
	const confirmed = await promptYesNo("Is this all correct?")
	if (!confirmed) {
		console.log("Okay, aborting.")
		process.exit(1)
	} else {
		console.log("Proceeding with submissions...")
	}
	const abi = JSON.parse(await fs.readFile(CONTRACT_ABI_PATH, "utf8"))
	const provider = new ethers.JsonRpcProvider(providerUrl)
	const connectedWallet = wallet.connect(provider)
	const contract = new ethers.Contract(contractAddress, abi, connectedWallet)

	// Ask user how many leaves to insert
	let numLeavesStr = await promptUserChoice("How many random leaves do you want to insert? ", [], false)
	let numLeaves = parseInt(numLeavesStr.trim(), 10)
	if (isNaN(numLeaves) || numLeaves < 1 || numLeaves > 100) {
		console.log("Aborting: number of leaves must be an integer between 1 and 100.")
		process.exit(1)
	}

	for (let i = 0; i < numLeaves; i++) {
		if (i > 0) {
			console.log(`Waiting ${DELAY_SECONDS} seconds before next submission...`)
			await sleep(DELAY_SECONDS * 1000)
		}
		// Generate random length between 1 and 128 bytes
		const randomLength = Math.floor(Math.random() * 128) + 1
		const randomBytes = ethers.randomBytes(randomLength)
		console.log(`[${i + 1}/${numLeaves}] Generated randomBytes of length: ${randomLength}`)
		const tx = await contract.addData(randomBytes)
		console.log(`[${i + 1}/${numLeaves}] Submitted tx:`, tx.hash)
		await tx.wait()
		console.log(`[${i + 1}/${numLeaves}] Transaction confirmed.`)
		const submission = { randomBytes: Buffer.from(randomBytes).toString("hex"), txHash: tx.hash }

		// Immediately append to JSON file after each successful submission
		let existingData: any[] = []
		try {
			const fileContent = await fs.readFile(OUTPUT_PATH, "utf8")
			existingData = JSON.parse(fileContent)
			if (!Array.isArray(existingData)) existingData = []
		} catch (err) {
			// File doesn't exist or is invalid, start fresh
			existingData = []
		}
		existingData.push(submission)
		await fs.writeFile(OUTPUT_PATH, JSON.stringify(existingData, null, 2))
	}

	console.log("Finished submitting random data.")
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
