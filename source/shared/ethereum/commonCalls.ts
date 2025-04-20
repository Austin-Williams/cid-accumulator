import { getSelector, getEventTopic, parseLeafInsertLog } from "./abiUtils.ts"
import { callContractView, ethRpcFetch } from "./ethRpcFetch.ts"
import { parseGetLatestCIDResult, parseGetAccumulatorDataResult, parseAccumulatorMetaBits } from "./abiUtils.ts"
import { AccumulatorMetadata, NormalizedLeafInsertEvent, PeakWithHeight, RawEthLog } from "../types.ts"
import { CID } from "multiformats/cid"
import { contractPeakHexToMmrCid } from "../codec.ts"

/**
 * Fetches the latest CID from the contract using a raw JSON-RPC call and ABI decoding.
 * @param rpcUrl - The Ethereum node RPC URL
 * @param contractAddress - The deployed contract address
 * @returns The latest CID as a multiformats.CID object
 */
export async function getLatestCID(rpcUrl: string, contractAddress: string): Promise<CID> {
	const selector = getSelector("getLatestCID()")
	const contractRootHex: string = await callContractView(rpcUrl, contractAddress, selector, "latest")
	const contractRootBytes = parseGetLatestCIDResult(contractRootHex)
	return CID.decode(Uint8Array.from(contractRootBytes))
}

export async function getAccumulatorData(
	rpcUrl: string,
	contractAddress: string,
	blockTag?: number
): Promise<{ meta: AccumulatorMetadata; peaks: PeakWithHeight[] }> {
	const blockTagHex: string = blockTag ? "0x" + blockTag.toString(16) : "latest"
	const selector = getSelector("getAccumulatorData()")
	const accumulatorDataHex: string = await callContractView(rpcUrl, contractAddress, selector, blockTagHex)
	const [mmrMetaBits, peaks] = parseGetAccumulatorDataResult(accumulatorDataHex)
	const meta = parseAccumulatorMetaBits(mmrMetaBits)
	const activePeaks: Uint8Array[] = peaks.slice(0, meta.peakCount) // only active peaks
	const activePeaksAsCids: CID[] = activePeaks.map(contractPeakHexToMmrCid)
	const activePeaksWithHeight: PeakWithHeight[] = activePeaksAsCids.map((cid, i) => ({
		cid,
		height: meta.peakHeights[i],
	}))
	return { meta, peaks: activePeaksWithHeight }
}

// --------------------- events
// Helper to format block numbers as 0x-prefixed hex strings
function toHexBlock(n: number): string {
	return "0x" + n.toString(16)
}

/**
 * Finds LeafInsert events using eth_getLogs.
 * @param rpcUrl string
 * @param contractAddress string
 * @param eventTopic string (keccak256 hash of event signature)
 * @param fromBlock string (hex or "latest")
 * @param toBlock string (hex or "latest")
 * @returns Promise<any[]> (array of log objects)
 */
export async function getLeafInsertLogs(
	rpcUrl: string,
	contractAddress: string,
	fromBlock: number,
	toBlock: number,
): Promise<NormalizedLeafInsertEvent[]> {
	const eventTopic = getEventTopic("LeafInsert(uint32,uint32,bytes,bytes32[])")
	const rawLogs: RawEthLog[] = await ethRpcFetch(rpcUrl, "eth_getLogs", [
		{
			address: contractAddress,
			topics: [eventTopic],
			fromBlock: toHexBlock(fromBlock),
			toBlock: toHexBlock(toBlock),
		},
	])

	// Defensive: filter for logs with topics[0] matching the event topic
	const parsedLogs: NormalizedLeafInsertEvent[] = await Promise.all(
		rawLogs.filter((log) => log.topics && log.topics[0] === eventTopic).map(parseLeafInsertLog),
	)
	return parsedLogs
}


/**
 * Finds a LeafInsert log for a specific leaf index using eth_getLogs.
 * @param rpcUrl string
 * @param contractAddress string
 * @param eventTopic string (keccak256 hash of event signature)
 * @param fromBlock string (hex or "latest")
 * @param toBlock string (hex or "latest")
 * @param targetLeafIndex number (the leaf index to filter for)
 * @returns Promise<any[]> (array of log objects for that leaf index)
 */
export async function getLeafInsertLogForTargetLeafIndex(
	rpcUrl: string,
	contractAddress: string,
	fromBlock: number,
	toBlock: number,
	targetLeafIndex: number,
): Promise<NormalizedLeafInsertEvent | null> {
	const eventTopic = getEventTopic("LeafInsert(uint32,uint32,bytes,bytes32[])")
	const leafIndexTopic = "0x" + targetLeafIndex.toString(16).padStart(64, "0")
	const topics = [eventTopic, leafIndexTopic]
	const rawLogs: RawEthLog[] = await ethRpcFetch(rpcUrl, "eth_getLogs", [
		{
			address: contractAddress,
			topics,
			fromBlock: toHexBlock(fromBlock),
			toBlock: toHexBlock(toBlock),
		},
	])
	if (rawLogs.length > 1) throw new Error(`Multiple logs found for leaf index ${targetLeafIndex} in range ${fromBlock}-${toBlock}`)
	if (rawLogs.length === 0) return null
	return parseLeafInsertLog(rawLogs[0])
}