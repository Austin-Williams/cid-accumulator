import "dotenv/config"
import { MerkleMountainRange } from "./shared/mmr.ts"
import assert from "assert"
import fs from "fs"
import { RawEthLog } from "./shared/types.ts"
import { parseLeafInsertLog } from "./shared/ethereum/abiUtils.ts"
import { getRootCIDFromPeaks } from "./shared/mmr.ts"
import { getLatestCID, getAccumulatorData } from "./shared/ethereum/commonCalls.ts"

async function main() {
	const contractAddress =
		process.env.TARGET_CONTRACT_ADDRESS ||
		(() => {
			throw new Error("Set TARGET_CONTRACT_ADDRESS in env")
		})()
	const rpcUrl =
		process.env.ETHEREUM_RPC_PROVIDER_URL ||
		(() => {
			throw new Error("Set ETHEREUM_RPC_PROVIDER_URL in env")
		})()

	// 1. Load events from blob if available
	let events
	const jsonPath = ".pinner/leafInsertEvents.json"
	events = JSON.parse(fs.readFileSync(jsonPath, "utf-8"))
	console.log(`Loaded ${events.length} events from ${jsonPath}`)

	// 2. Create a new MMR instance
	const mmr = new MerkleMountainRange()

	// 3. Insert each leaf in order
	for (let i = 0; i < events.length; ++i) {
		const event: RawEthLog = events[i] // we're pretending we just got this event from the provider
		const normalizedEvent = await parseLeafInsertLog(event)
		const newData = normalizedEvent.newData
		if (!newData) throw new Error(`Missing newData in event ${i}`)
		await mmr.addLeafWithTrail(newData, i)
		if ((i + 1) % 100 === 0) console.log(`Inserted ${i + 1} leaves...`)
	}

	// 4. Compute the root CID and trail
	const rootResult = await mmr.rootCIDWithTrail()
	const computedRoot = rootResult.root
	console.log("MMR Computed root CID:", computedRoot.toString())

	// 5. Fetch the contract's root CID

	const contractRootCID = await getLatestCID(rpcUrl, contractAddress)
	console.log("Contract root CID:", contractRootCID.toString())

	// 6. Compare
	if (computedRoot.toString() === contractRootCID.toString()) {
		console.log("\u2705 PASS: Roots match!")
	} else {
		console.error("\u274C FAIL: Roots do not match!")
		assert.fail("Roots do not match")
	}

	// --- Minimal root from contract peaks test ---
	console.log("\n--- minimalRootFromPeaks from contract peaks ---")
	// 1. Fetch contract peaks (hashes) and peak count
	const accumulatorData = await getAccumulatorData(rpcUrl, contractAddress)

	// console.log("[DEBUG] mmr.peaks (CID objects):", mmr.peaks)
	// console.log(
	// 	"[DEBUG] mmr.peaks (base32):",
	// 	mmr.peaks.map((c) => c.toString()),
	// )
	// console.log(
	// 	"[DEBUG] mmr.peaks digests:",
	// 	mmr.peaks.map((cid, i) => Buffer.from(cid.multihash.digest).toString("hex")),
	// )

	// --- Test minimalRootFromPeaks on contractPeaksAsMmrCids ---
	const minimalRootFromContractPeaks = await getRootCIDFromPeaks(accumulatorData.peaks.map((pwh) => pwh.cid))
	// WORKS: const minimalRootFromContractPeaks = await minimalRootFromPeaks(contractPeaksAsMmrCids)

	console.log("[DEBUG] minimalRootFromPeaks(contractPeaksAsMmrCids):", minimalRootFromContractPeaks.toString())
	if (minimalRootFromContractPeaks.toString() === contractRootCID.toString()) {
		console.log("\u2705 PASS: minimalRootFromPeaks(contractPeaksAsMmrCids) matches contract root!")
	} else {
		console.error("\u274C FAIL: minimalRootFromPeaks(contractPeaksAsMmrCids) does not match contract root!")
		assert.fail("minimalRootFromPeaks(contractPeaksAsMmrCids) does not match contract root")
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
