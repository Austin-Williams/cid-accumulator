
import type { AccumulatorClientConfig } from "./source/types/types.ts"
import { overrideForGetLeafInsertEventSignature, overrideForGetAccumulatorDataCalldata, overrideForGetLatestCIDCalldata } from "./source/utils/calldataOverrides.ts"
import { AccumulatorClient } from "./source/accumulator/client/AccumulatorClient.ts"
import { registerGracefulShutdown } from "./source/utils/gracefulShutdown.ts"
import { isNodeJs } from "./source/utils/envDetection.ts"

// Load config.json dynamically
// After loading config
const config = await import("./config.json").then(m => m.default ?? m) as AccumulatorClientConfig
async function main() {	
	const communityCIDAccumulatorContractAddress = "0x5E9c95DCCE8340A422FC1b6df167E82F8F07F5f4"
	const communityUserAddress = "0x95Fa48072939b07AE38E27430da3fb5AF2EC1468"

	let communityUserConfig = {...config}
	const contractAddress = "0x7BD24761E84a9003B346168B5F84FC2045b60E0e"
	communityUserConfig.LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE = overrideForGetLeafInsertEventSignature(communityUserAddress)
	communityUserConfig.GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE = overrideForGetAccumulatorDataCalldata(communityUserAddress)
	communityUserConfig.GET_LATEST_CID_CALLDATA_OVERRIDE = overrideForGetLatestCIDCalldata(communityUserAddress)


	// console log the community user config
	console.log("[Accumulator] Community user config:", JSON.stringify(communityUserConfig, null, 2))
	// Initialize AccumulatorClient
	const accumulatorClient = new AccumulatorClient(communityCIDAccumulatorContractAddress,communityUserConfig)
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
