import { ethers } from "ethers"
import { CID } from "multiformats/cid"
import { computePreviousRootCID } from "../source/client/computePreviousRootCID"
import { parseAccumulatorMetaBits } from "../source/shared/accumulator"
import { MINIMAL_ACCUMULATOR_ABI } from "../source/shared/constants"
import { encodeLinkNode, cidFromBytes32HexString } from "../source/shared/codec"
import dotenv from "dotenv"

dotenv.config()

const RPC_ENV = process.env.ETHEREUM_RPC_PROVIDER_URL || process.env.ACCUMULATOR_RPC_URL || process.env.RPC_URL
const CONTRACT_ENV = (process.env.TARGET_CONTRACT_ADDRESS ||
	process.env.ACCUMULATOR_CONTRACT_ADDRESS ||
	process.env.CONTRACT_ADDRESS) as string

if (!RPC_ENV || !CONTRACT_ENV) {
	console.error(
		"[test-walkback] ERROR: Missing RPC URL or contract address.\n" +
			"Set ETHEREUM_RPC_PROVIDER_URL or fallback (ACCUMULATOR_RPC_URL/RPC_URL), and TARGET_CONTRACT_ADDRESS or fallback (ACCUMULATOR_CONTRACT_ADDRESS/CONTRACT_ADDRESS) in your .env file.",
	)
	process.exit(1)
}

async function main() {
	const provider = new ethers.JsonRpcProvider(RPC_ENV)
	const contract = new ethers.Contract(CONTRACT_ENV, MINIMAL_ACCUMULATOR_ABI, provider)

	// Fetch accumulator metadata and peaks directly from contract
	// getAccumulatorData returns [mmrMetaBits, peaks]
	const [mmrMetaBits, peaksArr]: [bigint, string[]] = await contract.getAccumulatorData()

	// Use shared utility to parse metadata
	const meta = parseAccumulatorMetaBits(mmrMetaBits)

	const { leafCount, previousInsertBlockNumber } = meta
	if (typeof leafCount !== "number" || leafCount <= 0) throw new Error("No leaves in the accumulator.")
	// Use on-chain peakHeights and peakCount for initial peaks
	const { peakHeights, peakCount } = meta
	// Only use the first peakCount peaks and heights (as contract does)
	const initialPeakCIDs = (await Promise.all(peaksArr.slice(0, peakCount).map(cidFromBytes32HexString))).map(
		(cid) => cid as CID<unknown, 113, 18, 1>,
	)
	const initialPeakHeights = peakHeights.slice(0, peakCount)
	const initialPeaksWithHeights: { cid: CID<unknown, 113, 18, 1>; height: number }[] = initialPeakCIDs.map(
		(cid, i) => ({ cid, height: initialPeakHeights[i] }),
	)

	// Configure how many leaves to walk back
	const NUM_STEPS = parseInt(process.env.WALKBACK_STEPS || "6", 10)
	const fromLeafIndex = leafCount - 1
	const toLeafIndex = Math.max(0, fromLeafIndex - NUM_STEPS + 1)

	let currentPeaksWithHeights = initialPeaksWithHeights

	let currentLeafIndex = fromLeafIndex
	let currentBlockNumber = previousInsertBlockNumber
	for (let step = 0; currentLeafIndex >= toLeafIndex; step++) {
		// Fetch the log for this leaf
		const log = await (
			await import("../source/shared/logs")
		).getLeafInsertLog({
			provider,
			contract,
			targetLeafIndex: currentLeafIndex,
			fromBlock: currentBlockNumber,
			toBlock: currentBlockNumber,
		})
		if (!log) {
			break
		}

		const { newData, leftInputs, previousInsertBlockNumber, leafIndex } = log

		const leftCIDs: CID[] = await Promise.all(leftInputs.map((input) => cidFromBytes32HexString(input.toString())))

		try {
			const { previousRootCID, previousPeaksWithHeights } = await computePreviousRootCID(
				currentPeaksWithHeights,
				newData,
				leftCIDs,
			)

			// --- On-chain check ---
			// Fetch peaks at previousInsertBlockNumber
			let onChainPeaks: string[] = []
			try {
				const [mmrMetaBits, peaksArr]: [bigint, string[]] = await contract.getAccumulatorData({
					blockTag: previousInsertBlockNumber,
				})
				// Parse peakCount and peakHeights from mmrMetaBits
				const meta = parseAccumulatorMetaBits(mmrMetaBits)
				const peakCount = meta.peakCount
				onChainPeaks = peaksArr.slice(0, peakCount)
				const onChainCIDs = await Promise.all(onChainPeaks.map(cidFromBytes32HexString))
				// Compute on-chain root CID from onChainCIDs
				let onChainRootCID: CID | null = null
				if (onChainCIDs.length === 1) {
					onChainRootCID = onChainCIDs[0]
				} else if (onChainCIDs.length > 1) {
					// Fold using encodeLinkNode (Solidity: root = combine(combine(peaks[0], peaks[1]), ...))
					onChainRootCID = onChainCIDs[0]
					for (let i = 1; i < onChainCIDs.length; i++) {
						onChainRootCID = await encodeLinkNode(onChainRootCID, onChainCIDs[i])
					}
				}
				if (onChainRootCID) {
					const match = previousRootCID.toString() === onChainRootCID.toString()
					if (!match) {
						// Extra debug info for mismatch
						console.error("[MISMATCH] Computed previousRootCID does not match on-chain root CID!")
						console.error("  Step:", step)
						console.error("  leafIndex:", leafIndex)
						console.error("  block:", previousInsertBlockNumber)
						console.error("  Computed previousRootCID:", previousRootCID.toString())
						console.error("  On-chain root CID:", onChainRootCID.toString())
						throw new Error(`[MISMATCH] previousRootCID != on-chain root CID at block ${previousInsertBlockNumber}`)
					}
				}
			} catch (err) {
				console.error(`[CHECK] Error fetching or decoding on-chain peaks at block ${previousInsertBlockNumber}:`, err)
				throw err
			}
			currentPeaksWithHeights = previousPeaksWithHeights
			// DEBUG: Print new previousPeaksWithHeights
		} catch (err) {
			console.error(`[DEBUG] Error in computePreviousRootCID at step ${step}, leafIndex=${leafIndex}:`, err)
			throw err
		}
		// Prepare for next iteration
		currentLeafIndex -= 1
		currentBlockNumber = previousInsertBlockNumber
	}
}

main().catch((e) => {
	console.error("[test-walkback] Error:", e)
	process.exit(1)
})
