// shared/accumulator.ts
import { ethers } from "ethers"
import { MINIMAL_ACCUMULATOR_ABI } from "./constants.ts"
import { AccumulatorMetadata } from "./types.ts"

export async function getAccumulatorData(
	provider: ethers.JsonRpcProvider,
	contractAddress: string,
): Promise<AccumulatorMetadata> {
	const contract = new ethers.Contract(contractAddress, MINIMAL_ACCUMULATOR_ABI, provider)
	const [mmrMetaBits]: [bigint] = await contract.getAccumulatorData()

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
