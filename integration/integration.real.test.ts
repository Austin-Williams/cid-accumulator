import "dotenv/config"
import { Pinner } from "../source/pinner/Pinner"
import { CID } from "multiformats/cid"
import { getAccumulatorData } from "../source/shared/accumulator.ts"
import { getRPCProvider } from "../source/shared/rpc.ts"

async function main() {
	const CONTRACT_ADDRESS = process.env.TEST_TARGET_CONTRACT_ADDRESS
	const PROVIDER_URL = process.env.TEST_RPC_PROVIDER_URL
	console.log("[integration test] Using provider URL:", PROVIDER_URL)

	if (!CONTRACT_ADDRESS || !PROVIDER_URL) {
		console.error("ERROR: Set TEST_TARGET_CONTRACT_ADDRESS and TEST_RPC_PROVIDER_URL in your environment.")
		process.exit(1)
	}

	// Setup provider and contract
	const provider = getRPCProvider(PROVIDER_URL)
	const pinner = await Pinner.init(CONTRACT_ADDRESS, provider)

	console.log("[pinner] Syncing leaves from contract...")
	await pinner.syncForward({ logBatchSize: 100 })

	await pinner.verifyRootCID()
}

main().catch((e) => {
	console.error("ERROR:", e)
	process.exit(1)
})
