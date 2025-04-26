import { getSelector, getEventTopic, parseLeafInsertLog } from "./abiUtils.ts"
import { callContractView, ethRpcFetch } from "./ethRpcFetch.ts"
import { parseGetLatestCIDResult, parseGetAccumulatorDataResult, parseAccumulatorMetaBits } from "./abiUtils.ts"
import { AccumulatorMetadata, NormalizedLeafInsertEvent, PeakWithHeight, RawEthLog } from "../types/types.ts"
import { CID } from "../utils/CID.js"
import { contractPeakHexToMmrCid } from "../utils/codec.ts"

/**
 * Fetches the latest CID from the contract using a raw JSON-RPC call and ABI decoding.
 * @param ethereumHttpRpcUrl - The Ethereum node RPC URL
 * @param contractAddress - The deployed contract address
 * @returns The latest CID as a multiformats.CID object
 */
export async function getLatestCID(params: {
	ethereumHttpRpcUrl: string
	contractAddress: string
	getLatestCidSignatureOverride?: string
	getLatestCidCalldataOverride?: string
	blockTag?: number
}): Promise<CID> {
	const { ethereumHttpRpcUrl, contractAddress, getLatestCidSignatureOverride, getLatestCidCalldataOverride, blockTag } =
		params
	const blockTagHex: string = blockTag ? "0x" + blockTag.toString(16) : "latest"
	const signature = getLatestCidSignatureOverride ?? "getLatestCID()"
	const selector = getSelector(signature)
	const callData = getLatestCidCalldataOverride ?? selector
	const contractRootHex: string = await callContractView(ethereumHttpRpcUrl, contractAddress, callData, blockTagHex)
	const contractRootBytes = parseGetLatestCIDResult(contractRootHex)
	return CID.decode(Uint8Array.from(contractRootBytes))
}

export async function getAccumulatorData(params: {
	ethereumHttpRpcUrl: string
	contractAddress: string
	getAccumulatorDataCalldataOverride?: string
	blockTag?: number
}): Promise<{ meta: AccumulatorMetadata; peaks: PeakWithHeight[] }> {
	try {
		const { ethereumHttpRpcUrl, contractAddress, getAccumulatorDataCalldataOverride, blockTag } = params
		const blockTagHex: string = blockTag ? "0x" + blockTag.toString(16) : "latest"

		const signature = "getAccumulatorData()"
		const selector = getSelector(signature)
		const callData = getAccumulatorDataCalldataOverride ?? selector
		const accumulatorDataHex: string = await callContractView(
			ethereumHttpRpcUrl,
			contractAddress,
			callData,
			blockTagHex,
		)

		const [mmrMetaBits, peaks] = parseGetAccumulatorDataResult(accumulatorDataHex)
		const meta = parseAccumulatorMetaBits(mmrMetaBits)
		const activePeaks: Uint8Array[] = peaks.slice(0, meta.peakCount) // only active peaks
		const activePeaksAsCids: CID<unknown, 113, 18, 1>[] = activePeaks.map(contractPeakHexToMmrCid)
		const activePeaksWithHeight: PeakWithHeight[] = activePeaksAsCids.map((cid, i) => ({
			cid,
			height: meta.peakHeights[i],
		}))
		return { meta, peaks: activePeaksWithHeight }
	} catch (err) {
		console.error("][getAccumulatorData] Error:", err)
		throw err
	}
}

// --------------------- EVENTS --------------------
// Helper to format block numbers as 0x-prefixed hex strings
function toHexBlock(n: number): string {
	return "0x" + n.toString(16)
}

/**
 * Finds LeafInsert events using eth_getLogs.
 * @param ethereumHttpRpcUrl string
 * @param contractAddress string
 * @param eventTopic string (keccak256 hash of event signature)
 * @param fromBlock string (hex or "latest")
 * @param toBlock string (hex or "latest")
 * @returns Promise<any[]> (array of log objects)
 */
export async function getLeafInsertLogs(params: {
	ethereumHttpRpcUrl: string
	contractAddress: string
	fromBlock: number
	toBlock: number
	eventTopicOverride?: string
}): Promise<NormalizedLeafInsertEvent[]> {
	const { ethereumHttpRpcUrl, contractAddress, fromBlock, toBlock, eventTopicOverride } = params
	const eventTopic = eventTopicOverride ?? getEventTopic("LeafInsert(uint32,uint32,bytes,bytes32[])")
	const rawLogs: RawEthLog[] = await ethRpcFetch(ethereumHttpRpcUrl, "eth_getLogs", [
		{
			address: contractAddress,
			topics: [eventTopic],
			fromBlock: toHexBlock(fromBlock),
			toBlock: toHexBlock(toBlock),
		},
	])

	// Warn if topics[0] does not match eventTopic
	rawLogs.forEach((log, idx) => {
		const topic0 = log.topics ? log.topics[0].toLowerCase() : undefined
		const expected = eventTopic.toLowerCase()
		if (!log.topics || topic0 !== expected) {
			console.warn(
				`[WARN:getLeafInsertLogs] log[${idx}].topics[0] does not match eventTopic. topics[0]:`,
				topic0,
				"| eventTopic:",
				expected,
			)
		}
	})

	const parsedLogs: NormalizedLeafInsertEvent[] = await Promise.all(
		rawLogs
			.filter((log) => log.topics && log.topics[0] && log.topics[0].toLowerCase() === eventTopic.toLowerCase())
			.map(async (log, idx) => {
				return await parseLeafInsertLog(log)
			}),
	)
	return parsedLogs
}

/**
 * Finds a LeafInsert log for a specific leaf index using eth_getLogs.
 * @param ethereumHttpRpcUrl string
 * @param contractAddress string
 * @param eventTopic string (keccak256 hash of event signature)
 * @param fromBlock string (hex or "latest")
 * @param toBlock string (hex or "latest")
 * @param targetLeafIndex number (the leaf index to filter for)
 * @returns Promise<any[]> (array of log objects for that leaf index)
 */
export async function getLeafInsertLogForTargetLeafIndex(params: {
	ethereumHttpRpcUrl: string
	contractAddress: string
	fromBlock: number
	toBlock: number
	targetLeafIndex: number
	eventTopicOverride?: string
}): Promise<NormalizedLeafInsertEvent | null> {
	const { ethereumHttpRpcUrl, contractAddress, fromBlock, toBlock, targetLeafIndex, eventTopicOverride } = params
	const eventTopic = eventTopicOverride ?? getEventTopic("LeafInsert(uint32,uint32,bytes,bytes32[])")
	const leafIndexTopic = "0x" + targetLeafIndex.toString(16).padStart(64, "0")
	const topics = [eventTopic, leafIndexTopic]
	const rawLogs: RawEthLog[] = await ethRpcFetch(ethereumHttpRpcUrl, "eth_getLogs", [
		{
			address: contractAddress,
			topics,
			fromBlock: toHexBlock(fromBlock),
			toBlock: toHexBlock(toBlock),
		},
	])
	if (rawLogs.length > 1)
		throw new Error(`Multiple logs found for leaf index ${targetLeafIndex} in range ${fromBlock}-${toBlock}`)
	if (rawLogs.length === 0) return null
	return parseLeafInsertLog(rawLogs[0])
}
