import { getSelector } from "./abiUtils.ts"
import {callContractView} from "./ethRpcFetch.ts"
import {parseGetLatestCIDResult, parseGetAccumulatorDataResult} from "./abiUtils.ts"
import { CID } from "multiformats/cid"

/**
 * Fetches the latest CID from the contract using a raw JSON-RPC call and ABI decoding.
 * @param rpcUrl - The Ethereum node RPC URL
 * @param contractAddress - The deployed contract address
 * @returns The latest CID as a multiformats.CID object
 */
export async function getLatestCID(rpcUrl: string, contractAddress: string): Promise<CID> {
	const selector = getSelector("getLatestCID()")
	const contractRootHex: string = await callContractView(
		rpcUrl,
		contractAddress,
		selector,
		"latest"
	)
	const contractRootBytes = parseGetLatestCIDResult(contractRootHex)
	return CID.decode(Uint8Array.from(contractRootBytes))
}

export async function getAccumulatorData(rpcUrl: string, contractAddress: string): Promise<{mmrMetaBits: bigint, peaks: Uint8Array[]}> {
	const selector = getSelector("getAccumulatorData()")
	const accumulatorDataHex: string = await callContractView(
		rpcUrl,
		contractAddress,
		selector,
		"latest"
	)
	const accumulatorData = parseGetAccumulatorDataResult(accumulatorDataHex)
	return {mmrMetaBits: accumulatorData[0], peaks: accumulatorData[1]}
}