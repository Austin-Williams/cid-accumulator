import "dotenv/config"
import { Pinner } from "../source/pinner/Pinner"
import { ethers } from "ethers"
import { ThrottledProvider } from "../source/shared/ThrottledProvider"
import { CID } from "multiformats/cid"
import { base58btc } from "multiformats/bases/base58"
// import Database from "better-sqlite3"
// import fs from "fs"
// import path from "path"
// import { fileURLToPath } from "url"

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

async function main() {
	// const SUBMITTED_DATA_PATH = path.join(__dirname, "submitted-data.json")
	// const DB_PATH = process.env.TEST_DB_PATH || path.join(__dirname, "test-real.sqlite")
	const CONTRACT_ADDRESS = process.env.TEST_TARGET_CONTRACT_ADDRESS
	const PROVIDER_URL = process.env.TEST_RPC_PROVIDER_URL
	console.log("[integration test] Using provider URL:", PROVIDER_URL)

	if (!CONTRACT_ADDRESS || !PROVIDER_URL) {
		console.error("ERROR: Set TEST_TARGET_CONTRACT_ADDRESS and TEST_RPC_PROVIDER_URL in your environment.")
		process.exit(1)
	}

	// Setup provider and contract
	const provider = new ThrottledProvider(new ethers.JsonRpcProvider(PROVIDER_URL)) as unknown as ethers.JsonRpcProvider
	const pinner = await Pinner.init(CONTRACT_ADDRESS, provider)
	// Swap DB to our test DB
	//pinner.db = db // this may be causing problems?

	// Sync all leaves with a small batch size to avoid provider issues
	console.log("[pinner] Syncing leaves from contract...")
	try {
		await pinner.syncForward({ logBatchSize: 100, endBlock: 8127295 })
	} catch (err) {
		console.error("[integration test] Error during syncForward:", err)
		try {
			console.error("[integration test] Error details:", JSON.stringify(err, Object.getOwnPropertyNames(err)))
		} catch (jsonErr) {
			console.error("[integration test] Could not stringify error:", jsonErr)
		}
		process.exit(1)
	}
	console.log("[test] Finished syncing forward")
	console.log(`pinner root CID is: ${await pinner.mmr.rootCID()}`)
	const contractRootCID = await pinner.contract.getLatestCID()
	// Convert contractRootCID (likely a hex string) to a CID and print in base58btc
	const contractCID = CID.decode(Uint8Array.from(Buffer.from(contractRootCID.slice(2), "hex")))
	console.log(`contract root CID (default): ${contractCID}`)

	// // Check root CID
	// const contract = pinner.contract
	// const latestCID = await contract.getLatestCID()
	// const mmrRoot = (await pinner.mmr.rootCID()).toString()
	// if (latestCID !== mmrRoot) {
	//   console.error(`FAIL: Root CID mismatch. Contract: ${latestCID}, Pinner: ${mmrRoot}`)
	//   process.exit(1)
	// } else {
	//   console.log("PASS: Root CID matches contract")
	// }

	// console.log("Integration test completed successfully.")
	// process.exit(0)
}

main().catch((e) => {
	console.error("ERROR:", e)
	process.exit(1)
})
