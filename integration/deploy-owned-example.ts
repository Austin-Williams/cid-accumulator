import "dotenv/config"
import { ethers } from "ethers"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CONTRACT_ARTIFACT_PATH = path.resolve(__dirname, "../out/OwnedExample.sol/OwnedExample.json")
const OUTPUT_PATH = path.resolve(__dirname, "./deployed-owned-example.json")

async function main() {
	const providerUrl = process.env.TEST_RPC_PROVIDER_URL
	const mnemonic = process.env.TEST_MNEMONIC_FOR_SUBMITTER
	if (!providerUrl || !mnemonic) {
		throw new Error("Missing env: RPC_PROVIDER_URL or MNEMONIC_FOR_SUBMITTER")
	}

	// Read Foundry artifact for OwnedExample
	let artifact: any
	try {
		artifact = JSON.parse(await fs.readFile(CONTRACT_ARTIFACT_PATH, "utf8"))
	} catch {
		throw new Error("Missing OwnedExample.sol/OwnedExample.json (Foundry artifact). Please compile the contract.")
	}
	const abi = artifact.abi
	const bytecode = artifact.bytecode?.object
	if (!abi || !bytecode) {
		throw new Error("ABI or bytecode not found in Foundry artifact.")
	}

	const provider = new ethers.JsonRpcProvider(providerUrl)
	const wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider)
	const factory = new ethers.ContractFactory(abi, bytecode, wallet)

	// Prompt user for confirmation before deploying
	const { promptUserChoice } = await import("../source/shared/userPrompt.js")
	const confirm = await promptUserChoice("About to deploy OwnedExample. Proceed? (yes/no): ", ["yes", "no"], true)
	if (confirm.toLowerCase() !== "yes") {
		console.log("Aborting deployment.")
		process.exit(1)
	}

	console.log("Deploying OwnedExample...")
	const contract = await factory.deploy()
	await contract.waitForDeployment()
	const address = await contract.getAddress()
	console.log("Deployed to:", address)

	await fs.writeFile(OUTPUT_PATH, JSON.stringify({ address }, null, 2))
	console.log("Deployment info saved to", OUTPUT_PATH)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
