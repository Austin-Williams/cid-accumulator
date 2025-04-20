import "dotenv/config"
import { MerkleMountainRange } from "./shared/mmr.ts"
import {parseAccumulatorMetaBits} from "./shared/accumulator.ts"
import assert from "assert"
import fs from "fs"
import { RawEthLog } from "./shared/types.ts"
import { parseLeafInsertLog } from "./shared/parseLeafInsertLog.ts"
import { minimalRootFromPeaks } from "./minimalRootFromPeaks.ts"
import { CID } from "multiformats/cid"
import { create as createDigest } from "multiformats/hashes/digest"
import {getLatestCID, getAccumulatorData} from "./shared/ethereum/commonCalls.ts"

// Convert contract peak hex (digest) to the exact CID form used by mmr.peaks (wrap digest, do not hash)
function contractPeakHexToMmrCid(bytes: Uint8Array) {
	const digest = createDigest(0x12, bytes) // 0x12 = sha2-256
	return CID.create(1, 0x71, digest) // 0x71 = dag-cbor
}

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
		const normalizedEvent = parseLeafInsertLog(event)
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

	const meta = parseAccumulatorMetaBits(accumulatorData.mmrMetaBits)
	const peakCount = meta.peakCount
	const contractPeaks: Uint8Array[] = accumulatorData.peaks.slice(0, peakCount) // only active peaks
	// Convert each contract peak to a CID (dag-cbor, sha256) for apples-to-apples comparison
	// Top-level imports for sha256 and dagCbor
	const { sha256 } = await import("multiformats/hashes/sha2")
	const dagCbor = await import("@ipld/dag-cbor")

	const contractPeaksAsCids = await Promise.all(
		contractPeaks.map(async (bytes) => {
			const cborEncoded = dagCbor.encode(bytes)
			const digest = await sha256.digest(cborEncoded)
			// dag-cbor code is 0x71
			return CID.create(1, 0x71, digest)
		}),
	)
	// Log the conversion for all contract peaks to the form used by mmr.peaks
	const contractPeaksAsMmrCids = await Promise.all(contractPeaks.map(contractPeakHexToMmrCid))
	console.log(
		"[DEBUG] contractPeaksAsMmrCids (base32):",
		contractPeaksAsMmrCids.map((cid) => cid.toString()),
	)
	console.log(
		"[DEBUG] contractPeaksAsMmrCids digests:",
		contractPeaksAsMmrCids.map((cid) => Buffer.from(cid.multihash.digest).toString("hex")),
	)

	console.log("[DEBUG] mmr.peaks (CID objects):", mmr.peaks)
	console.log(
		"[DEBUG] mmr.peaks (base32):",
		mmr.peaks.map((c) => c.toString()),
	)
	console.log(
		"[DEBUG] mmr.peaks digests:",
		mmr.peaks.map((cid, i) => Buffer.from(cid.multihash.digest).toString("hex")),
	)

	// --- Test minimalRootFromPeaks on contractPeaksAsMmrCids ---
	const minimalRootFromContractPeaks = await minimalRootFromPeaks(contractPeaksAsMmrCids)
	console.log("[DEBUG] minimalRootFromPeaks(contractPeaksAsMmrCids):", minimalRootFromContractPeaks.toString())
	if (minimalRootFromContractPeaks.toString() === contractRootCID.toString()) {
		console.log("\u2705 PASS: minimalRootFromPeaks(contractPeaksAsMmrCids) matches contract root!")
	} else {
		console.error("\u274C FAIL: minimalRootFromPeaks(contractPeaksAsMmrCids) does not match contract root!")
		assert.fail("minimalRootFromPeaks(contractPeaksAsMmrCids) does not match contract root")
	}
	// const usedPeaks = contractPeaks.slice(0, peakCount)
	// console.log("[DEBUG] usedPeaks (hex):", usedPeaks)
	// console.log("[DEBUG] peakHeights:", meta.peakHeights.slice(0, peakCount))
	// for (let i = 0; i < peakCount; i++) {
	// 	console.log(`[DEBUG] peak[${i}] height=${meta.peakHeights[i]} hash=${usedPeaks[i]}`)
	// }
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
