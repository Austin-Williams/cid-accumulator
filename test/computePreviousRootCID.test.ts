import { computePreviousRootCIDAndPeaksWithHeights } from "./computePreviousRootCID.ts"
import { getAccumulatorData, getLeafInsertLogForTargetLeafIndex } from "./ethereum/commonCalls.js"
import dotenv from "dotenv"

dotenv.config()

const ETHEREUM_RPC_PROVIDER_URL = process.env.ETHEREUM_RPC_PROVIDER_URL as string
const TARGET_CONTRACT_ADDRESS = process.env.TARGET_CONTRACT_ADDRESS as string

async function runTest() {
	const NUM_STEPS = parseInt(process.env.WALKBACK_STEPS || "5", 10)
	// Fetch the latest accumulator state
	const { meta, peaks } = await getAccumulatorData(ETHEREUM_RPC_PROVIDER_URL, TARGET_CONTRACT_ADDRESS)
	const { leafCount, previousInsertBlockNumber } = meta
	if (typeof leafCount !== "number" || leafCount <= 0) throw new Error("No leaves in the accumulator.")
	let currentLeafIndex = leafCount - 1
	let currentBlockNumber = previousInsertBlockNumber
	let currentPeaksWithHeights = peaks

	const results: { step: number; ok: boolean; error?: any }[] = []

	for (let step = 0; step < NUM_STEPS && currentLeafIndex >= 0; step++) {
		console.log(`\n[STEP ${step}] currentLeafIndex: ${currentLeafIndex}, currentBlockNumber: ${currentBlockNumber}`)
		const event = await getLeafInsertLogForTargetLeafIndex(
			ETHEREUM_RPC_PROVIDER_URL,
			TARGET_CONTRACT_ADDRESS,
			currentBlockNumber,
			currentBlockNumber,
			currentLeafIndex,
		)
		if (!event) {
			console.error(
				`[STEP ${step}] No event found for currentLeafIndex=${currentLeafIndex}, currentBlockNumber=${currentBlockNumber}`,
			)
			results.push({ step, ok: false, error: "No event found" })
			break
		}
		console.log(`[STEP ${step}] Inputs:`)
		console.log(`  peaks:`, currentPeaksWithHeights)
		console.log(`  newData:`, event.newData)
		console.log(`  leftInputs:`, event.leftInputs)
		let ok = false,
			error = undefined
		try {
			const { previousRootCID, previousPeaksWithHeights } = await computePreviousRootCIDAndPeaksWithHeights(
				currentPeaksWithHeights,
				event.newData,
				event.leftInputs,
			)
			console.log(`[STEP ${step}] Result:`, previousRootCID)
			ok = true
			// Prepare for next iteration
			currentPeaksWithHeights = previousPeaksWithHeights
			currentLeafIndex -= 1
			currentBlockNumber = event.previousInsertBlockNumber
		} catch (e) {
			console.error(`[STEP ${step}] Error:`, e)
			error = e
			break
		}
		results.push({ step, ok, error })
	}

	// Final summary
	console.log("\n--- Walkback Test Summary ---")
	results.forEach((r) => {
		if (r.ok) {
			console.log(`Step ${r.step}: PASS`)
		} else {
			console.log(`Step ${r.step}: FAIL (${r.error})`)
		}
	})
}

runTest().catch(console.error)
