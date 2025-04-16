import { Log } from "ethers"
import { decodeLeafInsert } from "../shared/codec.ts"
import { retryRpcCall } from "../shared/rpc.ts"
import { Pinner } from "./Pinner.ts"

export async function rebuildLocalDag(pinner: Pinner, startLeaf: number, endLeaf: number | null): Promise<void> {
	if (endLeaf === null || endLeaf === undefined || startLeaf > endLeaf) {
		throw new Error("[pinner] endLeaf must be a number and startLeaf must be less than or equal to endLeaf.")
	}

	console.log(`[pinner] Rebuilding and verifying local DAG from ${endLeaf - startLeaf} synced leaves.`)

	const select = pinner.db.prepare(
		`SELECT data, block_number, previous_insert_block FROM leaf_events WHERE leaf_index = ?`,
	)

	for (let leafIndex = startLeaf; leafIndex <= endLeaf; leafIndex++) {
		const row = select.get(leafIndex) as
			| {
					data: Buffer
					block_number?: number
					previous_insert_block?: number
			  }
			| undefined

		if (!row) {
			throw new Error(`[pinner] Leaf index ${leafIndex} missing from DB unexpectedly.`)
		}

		const data = new Uint8Array(row.data)
		const blockNumber = row.block_number ?? undefined
		const previousInsertBlockNumber = row.previous_insert_block ?? undefined
		const params = { leafIndex, data, blockNumber, previousInsertBlockNumber }
		await pinner.processLeafEvent(params)
	}
	console.log(`[pinner] Rebuilt and verified local DAG from leafIndex ${startLeaf} to ${endLeaf}.`)
}

export async function syncForward(
	pinner: Pinner,
	startBlock: number,
	logBatchSize?: number,
	throttleSeconds?: number,
): Promise<void> {
	const latestBlock = await retryRpcCall(() => pinner.provider.getBlockNumber())
	console.log(`[pinner] Syncing forward from block ${startBlock} to ${latestBlock}...`)
	const batchSize = logBatchSize ?? 10000

	for (let from = startBlock; from <= latestBlock; from += batchSize) {
		if (throttleSeconds) await new Promise((r) => setTimeout(r, throttleSeconds * 1000))
		const to = Math.min(from + batchSize - 1, latestBlock)
		console.log(`[pinner] Fetching logs from block ${from} to ${to}`)

		const logs: Log[] = await retryRpcCall(() =>
			pinner.provider.getLogs({
				...pinner.contract.filters.LeafInsert(),
				fromBlock: from,
				toBlock: to,
			}),
		)

		for (const log of logs) {
			const { leafIndex, previousInsertBlockNumber, newData } = decodeLeafInsert(log)

			if (leafIndex < pinner.syncedToLeafIndex + 1) continue
			if (leafIndex > pinner.syncedToLeafIndex + 1) {
				throw new Error(`[pinner] LeafIndex gap detected. Expected ${pinner.syncedToLeafIndex + 1}, got ${leafIndex}`)
			}

			await pinner.processLeafEvent({
				leafIndex,
				blockNumber: log.blockNumber,
				data: new Uint8Array(Buffer.from(newData.slice(2), "hex")),
				previousInsertBlockNumber,
			})
		}
	}
	console.log(`[pinner] Synced up to block ${latestBlock}.`)
}
