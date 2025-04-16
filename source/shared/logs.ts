import { ethers } from "ethers"

/**
 * Retrieves the LeafInsert log for a given leafIndex within a specified block range.
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
export async function getLeafInsertLog(params: {
	provider: ethers.JsonRpcProvider
	contract: ethers.Contract
	leafIndex: number
	fromBlock: number
	toBlock?: number | undefined
}): Promise<ethers.Log | null> {
	let { provider, contract, leafIndex, fromBlock, toBlock } = params
	const filter = contract.filters.LeafInsert()
	const options: ethers.Filter = {
		...filter,
		fromBlock: fromBlock,
		toBlock: toBlock ?? "latest",
	}
	const logs = await provider.getLogs(options)
	// There should exist either 0 or 1 logs for this leafIndex. If there are more, throw.
	if (logs.length == 0) return null
	if (logs.length > 1) throw new Error(`Multiple LeafInsert logs found for leafIndex ${leafIndex}`)
	return logs[0]
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
