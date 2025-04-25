import { getLeafInsertLogForTargetLeafIndex } from "../ethereum/commonCalls.ts"
import { NormalizedLeafInsertEvent } from "../types/types.ts"

/**
 * Walks back along the previousInsertBlockNumber chain, starting from fromLeafIndex,
 * until toLeafIndex is reached (inclusive). Returns logs in order from oldest to newest.
 * Throws if a log is missing or the chain cannot be completed.
 * WARNING: This is a very slow way to walk back because it requires one (cheap) RPC call per leaf.
 * This is intended to be used only for filling in a few missed leaves for accumulator nodes that are already synced
 * and are processing live events.
 */
export async function walkBackLeafInsertLogsOrThrow(
	ethereumHttpRpcUrl: string,
	contractAddress: string,
	fromLeafIndex: number,
	fromLeafIndexBlockNumber: number,
	toLeafIndex: number, // inclusive; oldest leaf index to walk back to
	eventTopicOverride?: string,
): Promise<NormalizedLeafInsertEvent[]> {
	let currentLeafIndex = fromLeafIndex
	let currentLeafIndexBlockNumber = fromLeafIndexBlockNumber
	const logs: NormalizedLeafInsertEvent[] = []

	while (currentLeafIndex >= toLeafIndex) {
		const log: NormalizedLeafInsertEvent | null = await getLeafInsertLogForTargetLeafIndex({
			ethereumHttpRpcUrl,
			contractAddress,
			fromBlock: currentLeafIndexBlockNumber,
			toBlock: currentLeafIndexBlockNumber,
			targetLeafIndex: currentLeafIndex,
			eventTopicOverride,
		})
		if (!log) {
			throw new Error(
				`Missing LeafInsert log for leafIndex=${currentLeafIndex} in block=${currentLeafIndexBlockNumber}`,
			)
		}
		logs.push(log)
		if (currentLeafIndex === toLeafIndex) break
		// Defensive: avoid infinite loop
		if (log.leafIndex === undefined || log.previousInsertBlockNumber === undefined) {
			throw new Error(`[walkBackLeafInsertLogsOrThrow] Malformed LeafInsert log at leafIndex ${currentLeafIndex}`)
		}
		// Prepare for next iteration
		currentLeafIndex = log.leafIndex - 1
		currentLeafIndexBlockNumber = log.previousInsertBlockNumber
		if (currentLeafIndex < toLeafIndex) {
			throw new Error(`[walkBackLeafInsertLogsOrThrow] Walkback went past toLeafIndex (${toLeafIndex})`)
		}
	}

	return logs.reverse() // Oldest to newest
}
