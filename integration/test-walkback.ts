import { CID } from "multiformats/cid"
import { computePreviousRootCID } from "../source/shared/computePreviousRootCID"
import {getAccumulatorData, getLeafInsertLogForTargetLeafIndex} from "../source/shared/ethereum/commonCalls"
import {getRootCIDFromPeaks} from "../source/shared/mmr.ts"
import dotenv from "dotenv"

dotenv.config()

const ETHEREUM_RPC_PROVIDER_URL = process.env.ETHEREUM_RPC_PROVIDER_URL as string
const TARGET_CONTRACT_ADDRESS = process.env.TARGET_CONTRACT_ADDRESS as string

async function main() {
	// Fetch accumulator metadata and peaks directly from contract


	// Use shared utility to parse metadata
	const { meta, peaks } = await getAccumulatorData(ETHEREUM_RPC_PROVIDER_URL, TARGET_CONTRACT_ADDRESS)
	const { leafCount, previousInsertBlockNumber } = meta
	if (typeof leafCount !== "number" || leafCount <= 0) throw new Error("No leaves in the accumulator.")
	// Use on-chain peakHeights and peakCount for initial peaks
	const initialPeaksWithHeights: { cid: CID; height: number }[] = peaks

	// Configure how many leaves to walk back
	const NUM_STEPS = parseInt(process.env.WALKBACK_STEPS || "6", 10)
	const fromLeafIndex = leafCount - 1
	const toLeafIndex = Math.max(0, fromLeafIndex - NUM_STEPS + 1)

	let currentPeaksWithHeights = initialPeaksWithHeights

	let currentLeafIndex = fromLeafIndex
	let currentBlockNumber = previousInsertBlockNumber
	for (let step = 0; currentLeafIndex >= toLeafIndex; step++) {
		// Fetch the log for this leaf
		const event = await getLeafInsertLogForTargetLeafIndex(ETHEREUM_RPC_PROVIDER_URL, TARGET_CONTRACT_ADDRESS, currentBlockNumber, currentBlockNumber, currentLeafIndex)
		if (!event) {
			break
		}

		const { previousRootCID, previousPeaksWithHeights } = await computePreviousRootCID(
			currentPeaksWithHeights,
			event.newData,
			event.leftInputs,
		)

		// --- On-chain check ---
		const { meta, peaks } = await getAccumulatorData(ETHEREUM_RPC_PROVIDER_URL, TARGET_CONTRACT_ADDRESS, previousInsertBlockNumber)
		const actualPreviousRootCID: CID = await getRootCIDFromPeaks(peaks.map(p => p.cid))
		
		const match = previousRootCID.toString() === actualPreviousRootCID.toString()
		if (!match) {
			// Extra debug info for mismatch
			console.error("[MISMATCH] Computed previousRootCID does not match actualPreviousRootCID root CID!")
			console.error("  Step:", step)
			console.error("  leafIndex:", currentLeafIndex)
			console.error("  block:", previousInsertBlockNumber)
			console.error("  Computed previousRootCID:", previousRootCID.toString())
			console.error("  actualPreviousRootCID (On-chain) root CID:", actualPreviousRootCID.toString())
			throw new Error(`[MISMATCH] previousRootCID != on-chain root CID at block ${previousInsertBlockNumber}`)
		}
	}

		currentPeaksWithHeights = peaks
		// Prepare for next iteration
		currentLeafIndex -= 1
		currentBlockNumber = previousInsertBlockNumber
}


main().catch((e) => {
	console.error("[test-walkback] Error:", e)
	process.exit(1)
})
