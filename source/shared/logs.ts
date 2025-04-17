import { ethers } from "ethers"
import { getAccumulatorData } from "./accumulator.ts"
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
	leafIndex: number
	fromBlock: number
	toBlock?: number | undefined
}): Promise<ethers.Log | null> {
	let { provider, contract, leafIndex, fromBlock, toBlock } = params
	const endBlock = typeof toBlock === "number" ? toBlock : undefined
	const logs: ethers.Log[] = []
	let currentFrom = fromBlock
	let currentTo = endBlock ?? fromBlock
	if (endBlock === undefined) {
		// If toBlock is "latest", fetch latest block number
		currentTo = await provider.getBlockNumber()
	}
	while (currentFrom <= currentTo) {
		const chunkTo = Math.min(currentFrom + MAX_BLOCK_RANGE - 1, currentTo)
		const filter = contract.filters.LeafInsert()
		const options: ethers.Filter = {
			address: contract.target,
			...filter,
			fromBlock: currentFrom,
			toBlock: chunkTo,
		}
		console.log(`[getLeafInsertLog] getLogs chunk: fromBlock=${currentFrom}, toBlock=${chunkTo}`)
		try {
			const chunkLogs = await provider.getLogs(options)
			logs.push(...chunkLogs)
		} catch (err) {
			console.error("[getLeafInsertLog] getLogs error:", err)
			throw err
		}
		if (chunkTo === currentTo) break
		currentFrom = chunkTo + 1
	}
	// Filter logs by leafIndex
	const matchingLogs = logs.filter((log) => {
		try {
			const decoded = contract.interface.decodeEventLog("LeafInsert", log.data, log.topics)
			return decoded.leafIndex !== undefined && decoded.leafIndex.toString() === leafIndex.toString()
		} catch (e) {
			return false
		}
	})
	if (matchingLogs.length > 1) {
		throw new Error(
			`[getLeafInsertLog] Multiple logs found for leafIndex ${params.leafIndex} in range ${fromBlock}-${toBlock}`,
		)
	}
	if (matchingLogs.length === 1) {
		return matchingLogs[0]
	}
	return null
}

/**
 * Walks back along the previousInsertBlockNumber chain, starting from fromLeafIndex,
 * until toLeafIndex is reached (inclusive). Returns logs in order from oldest to newest.
 * Throws if a log is missing or the chain cannot be completed.
 */
export async function walkBackLeafInsertLogsOrThrow(params: {
	provider: ethers.JsonRpcProvider
	contract: ethers.Contract
	fromLeafIndex: number
	fromLeafIndexBlockNumber: number //
	toLeafIndex: number // inclusive; oldest leaf index to walk back to
}): Promise<ethers.Log[]> {
	const { provider, contract, fromLeafIndex, fromLeafIndexBlockNumber, toLeafIndex } = params
	let currentLeafIndex = fromLeafIndex
	let currentLeafIndexBlockNumber = fromLeafIndexBlockNumber
	const logs: ethers.Log[] = []

	while (currentLeafIndex >= toLeafIndex) {
		const log = await getLeafInsertLog({
			provider,
			contract,
			leafIndex: currentLeafIndex,
			fromBlock: currentLeafIndexBlockNumber,
			toBlock: currentLeafIndexBlockNumber,
		})
		if (!log) throw new Error(`Missing LeafInsert log for leafIndex ${currentLeafIndex}`)
		logs.push(log)
		if (currentLeafIndex === toLeafIndex) break
		// Decode the log to get previousInsertBlockNumber
		const decoded = contract.interface.decodeEventLog("LeafInsert", log.data, log.topics)
		// Defensive: avoid infinite loop
		if (decoded.leafIndex === undefined || decoded.previousInsertBlockNumber === undefined) {
			throw new Error(`Malformed LeafInsert log at leafIndex ${currentLeafIndex}`)
		}
		// Prepare for next iteration
		currentLeafIndex--
		currentLeafIndexBlockNumber = decoded.previousInsertBlockNumber
		if (currentLeafIndex < toLeafIndex) throw new Error(`Walkback went past toLeafIndex (${toLeafIndex})`)
	}

	return logs.reverse() // Oldest to newest
}

/**
 * Finds the block number in which the leaf with the given index was inserted.
 * WARNING: Not ideal for free-tier RPC users. Use sparingly.
 * This is used to find the first block to start syncing forward from when no other options are available.
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
	const log = await getLeafInsertLog({ provider, contract, leafIndex, fromBlock, toBlock: lastLeafBlockNumber })
	return log?.blockNumber
}
