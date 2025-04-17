import { ethers } from "ethers"
import { getAccumulatorData } from "./accumulator.ts"
import { decodeLeafInsert } from "./codec.ts"
import { LeafInsertEvent } from "./types.ts"
/**
 * Retrieves the LeafInsert log for a given leafIndex within a specified block range.
 * Ideally used with fromBlock == toBlock for efficiency.
 *
 * @param provider - An ethers.JsonRpcProvider instance
 * @param contract - The ethers.Contract instance for the accumulator
 * @param leafIndex - The leaf index to search for
 * @param fromBlock - The starting block number for the search
 * @param toBlock - (Optional) The ending block number for the search (defaults to latest)
 *
 * @returns The log for the given leafIndex, or null if not found.
 * @throws If multiple logs are found for the given leafIndex in the specified range.
 */
const MAX_BLOCK_RANGE = 1000

export async function getLeafInsertLog(params: {
	provider: ethers.JsonRpcProvider
	contract: ethers.Contract
	targetLeafIndex: number
	fromBlock: number
	toBlock?: number | undefined
}): Promise<LeafInsertEvent | null> {
	let { provider, contract, targetLeafIndex, fromBlock, toBlock } = params

	// Determine the last block to search. If toBlock is not provided, use the latest block on the chain.
	let lastBlockToSearch: number
	if (typeof toBlock === "number") {
		lastBlockToSearch = toBlock
	} else {
		lastBlockToSearch = await provider.getBlockNumber()
	}

	// Set up the search window.
	let currentFrom: number = fromBlock
	let currentTo: number = lastBlockToSearch

	while (currentFrom <= currentTo) {
		const chunkTo: number = Math.min(currentFrom + MAX_BLOCK_RANGE - 1, currentTo)
		const filter = {
			address: await contract.getAddress(),
			...contract.filters.LeafInsert(targetLeafIndex),
			fromBlock: currentFrom,
			toBlock: chunkTo,
		}

		if (currentFrom == chunkTo) {
			console.log(`[logs fetch] Fetching log for leaf index ${targetLeafIndex} from block ${currentFrom}`)
		} else {
			console.log(`[logs fetch] Fetching logs from block ${currentFrom} to block ${chunkTo}`)
		}

		const chunkLogs = await provider.getLogs(filter)
		if (chunkLogs.length > 1)
			throw new Error(
				`[logs fetch] Multiple logs found for leaf index ${targetLeafIndex} in range ${fromBlock}-${toBlock}`,
			)
		if (chunkLogs.length === 1) {
			// found it!
			const decodedLeafInsert: LeafInsertEvent = decodeLeafInsert(chunkLogs[0])
			if (decodedLeafInsert.leafIndex === undefined)
				throw new Error(`[logs fetch] leafIndex is undefined ${JSON.stringify(chunkLogs[0])}`)
			if (decodedLeafInsert.previousInsertBlockNumber === undefined)
				throw new Error(`[logs fetch] previousInsertBlockNumber is undefined ${JSON.stringify(chunkLogs[0])}`)
			if (decodedLeafInsert.newData === undefined)
				throw new Error(`[logs fetch] newData is undefined ${JSON.stringify(chunkLogs[0])}`)
			if (decodedLeafInsert.combineResults === undefined)
				throw new Error(`[logs fetch] combineResults is undefined ${JSON.stringify(chunkLogs[0])}`)
			if (decodedLeafInsert.rightInputs === undefined)
				throw new Error(`[logs fetch] rightInputs is undefined ${JSON.stringify(chunkLogs[0])}`)
			if (chunkLogs[0].blockNumber === undefined)
				throw new Error(`[logs fetch] blockNumber is undefined ${JSON.stringify(chunkLogs[0])}`)

			return {
				leafIndex: decodedLeafInsert.leafIndex,
				previousInsertBlockNumber: decodedLeafInsert.previousInsertBlockNumber,
				newData: decodedLeafInsert.newData,
				combineResults: decodedLeafInsert.combineResults,
				rightInputs: decodedLeafInsert.rightInputs,
				blockNumber: Number(chunkLogs[0].blockNumber),
			}
		}
	}
	return null
}

/**
 * Walks back along the previousInsertBlockNumber chain, starting from fromLeafIndex,
 * until toLeafIndex is reached (inclusive). Returns logs in order from oldest to newest.
 * Throws if a log is missing or the chain cannot be completed.
 * WARNING: This is a very slow way to walk back because it requires one (cheap) RPC call per leaf.
 * This is intended to be used only for filling in a few missed leaves for pinners that are already synced
 * and are processing live events.
 */
export async function walkBackLeafInsertLogsOrThrow(params: {
	provider: ethers.JsonRpcProvider
	contract: ethers.Contract
	fromLeafIndex: number
	fromLeafIndexBlockNumber: number //
	toLeafIndex: number // inclusive; oldest leaf index to walk back to
}): Promise<LeafInsertEvent[]> {
	const { provider, contract, fromLeafIndex, fromLeafIndexBlockNumber, toLeafIndex } = params
	let currentLeafIndex = fromLeafIndex
	let currentLeafIndexBlockNumber = fromLeafIndexBlockNumber
	const logs: LeafInsertEvent[] = []

	while (currentLeafIndex >= toLeafIndex) {
		const log: LeafInsertEvent | null | null = await getLeafInsertLog({
			provider,
			contract,
			targetLeafIndex: currentLeafIndex,
			fromBlock: currentLeafIndexBlockNumber,
			toBlock: currentLeafIndexBlockNumber,
		})
		if (!log)
			throw new Error(`[walkBackLeafInsertLogsOrThrow] Missing LeafInsert log for leafIndex ${currentLeafIndex}`)

		logs.push(log)
		if (currentLeafIndex === toLeafIndex) break
		// Defensive: avoid infinite loop
		if (log.leafIndex === undefined || log.previousInsertBlockNumber === undefined) {
			throw new Error(`[walkBackLeafInsertLogsOrThrow] Malformed LeafInsert log at leafIndex ${currentLeafIndex}`)
		}
		// Prepare for next iteration
		currentLeafIndex--
		currentLeafIndexBlockNumber = log.previousInsertBlockNumber
		if (currentLeafIndex < toLeafIndex)
			throw new Error(`[walkBackLeafInsertLogsOrThrow] Walkback went past toLeafIndex (${toLeafIndex})`)
	}

	return logs.reverse() // Oldest to newest
}

/**
 * Finds the block number in which the leaf with the given index was inserted.
 * WARNING: Not ideal for free-tier RPC users. Use sparingly.
 * This is only ever used to find the first block to start syncing forward from when no other options are available.
 * @param provider - ethers.JsonRpcProvider
 * @param contract - ethers.Contract
 * @param leafIndex - The leaf index to search for
 * @param fromBlock - The block to start searching from (usually contract deploy block)
 * @returns The block number, or undefined if not found
 */
export async function findBlockForLeafIndex(params: {
	provider: ethers.JsonRpcProvider
	contract: ethers.Contract
	leafIndex: number
	fromBlock: number
}): Promise<number | undefined> {
	const { provider, contract, leafIndex, fromBlock } = params
	const accumulatorData = await getAccumulatorData(provider, await contract.getAddress())
	const lastLeafBlockNumber = accumulatorData.previousInsertBlockNumber
	const log = await getLeafInsertLog({
		provider,
		contract,
		targetLeafIndex: leafIndex,
		fromBlock,
		toBlock: lastLeafBlockNumber,
	})
	return log?.blockNumber
}
