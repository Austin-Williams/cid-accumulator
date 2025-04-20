import { getSelector } from "./abiUtils.ts"
import { callContractView } from "./ethRpcFetch.ts"
import { parseGetLatestCIDResult, parseGetAccumulatorDataResult, parseAccumulatorMetaBits } from "./abiUtils.ts"
import { AccumulatorMetadata, PeakWithHeight } from "../types.ts"
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
): Promise<{ meta: AccumulatorMetadata; peaks: PeakWithHeight[] }> {
	const selector = getSelector("getAccumulatorData()")
	const accumulatorDataHex: string = await callContractView(rpcUrl, contractAddress, selector, "latest")
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
