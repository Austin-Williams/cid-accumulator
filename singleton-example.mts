
import { AccumulatorClient } from "cid-accumulator-client"
import { config } from "./config"
import { isNodeJs, registerGracefulShutdown, overrideForGetLeafInsertEventSignature, overrideForGetAccumulatorDataCalldata, overrideForGetLatestCIDCalldata } from "./source/utils"

async function main() {	
	const singletonCIDAccumulatorContractAddress = "0x5E9c95DCCE8340A422FC1b6df167E82F8F07F5f4"
	const singletonUserAddress = "0x95Fa48072939b07AE38E27430da3fb5AF2EC1468"

	let singletonUserConfig = {...config}
	const contractAddress = "0x7BD24761E84a9003B346168B5F84FC2045b60E0e"
	singletonUserConfig.LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE = overrideForGetLeafInsertEventSignature(singletonUserAddress)
	singletonUserConfig.GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE = overrideForGetAccumulatorDataCalldata(singletonUserAddress)
	singletonUserConfig.GET_LATEST_CID_CALLDATA_OVERRIDE = overrideForGetLatestCIDCalldata(singletonUserAddress)
	singletonUserConfig.DB_PATH = './.db/singleton-example.json'

	// console log the singleton user config
	console.log("[Accumulator] singleton user config:", JSON.stringify(singletonUserConfig, null, 2))
	// Initialize AccumulatorClient
	const accumulatorClient = new AccumulatorClient(singletonCIDAccumulatorContractAddress,singletonUserConfig)
	await accumulatorClient.start()

	if (isNodeJs()) {
		// (Optional) Register SIGINT handler for graceful shutdown in NodeJs (not needed in browser)
		registerGracefulShutdown(accumulatorClient)
		// Keep the process running if in NodeJs (not needed in browser)
		console.log("[Accumulator] Running in persistent mode. Press Ctrl+C to exit.");
		await new Promise(() => {})
	}
}

await main().catch((e) => {
	console.error("\u{274C} Example runner error:", e)
	process.exit(1)
})
