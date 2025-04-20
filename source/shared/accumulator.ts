// shared/accumulator.ts
import { ethers } from "ethers"
import { MINIMAL_ACCUMULATOR_ABI } from "./constants.ts"
import { AccumulatorMetadata } from "./types.ts"

export function parseAccumulatorMetaBits(mmrMetaBits: bigint): AccumulatorMetadata {
	const bits = mmrMetaBits
	const peakHeights: number[] = []
	for (let i = 0; i < 32; i++) {
		peakHeights.push(Number((bits >> BigInt(i * 5)) & 0x1fn))
	}
	const peakCount = Number((bits >> 160n) & 0x1fn)
	const leafCount = Number((bits >> 165n) & 0xffffffffn)
	const previousInsertBlockNumber = Number((bits >> 197n) & 0xffffffffn)
	const deployBlockNumber = Number((bits >> 229n) & 0x7ffffffn)

	return {
		peakHeights,
		peakCount,
		leafCount,
		previousInsertBlockNumber,
		deployBlockNumber,
	}
}

import { callContractView } from "./ethereum/ethRpcFetch.ts"

// getAccumulatorData() selector is first 4 bytes of keccak256("getAccumulatorData()")
const GET_ACCUMULATOR_DATA_SELECTOR = "0x7b9fa2e0" // precomputed

export async function getAccumulatorMmrMetaBits(
	rpcUrl: string,
	contractAddress: string,
): Promise<AccumulatorMetadata> {
	const hexResult: string = await callContractView(
		rpcUrl,
		contractAddress,
		GET_ACCUMULATOR_DATA_SELECTOR,
		"latest"
	)
	// ABI: returns (uint256). Remove 0x, parse as BigInt
	const hex = hexResult.startsWith("0x") ? hexResult.slice(2) : hexResult
	const mmrMetaBits = BigInt("0x" + hex.padStart(64, "0"))
	return parseAccumulatorMetaBits(mmrMetaBits)
}
