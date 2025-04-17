import { Log } from "ethers"
import { decodeLeafInsert } from "../shared/codec.ts"
import { Pinner } from "./Pinner.ts"
import { getAccumulatorData } from "../shared/accumulator.ts"
import { findBlockForLeafIndex } from "../shared/logs.ts"
import { CID } from "multiformats/cid"

export async function rebuildLocalDag(pinner: Pinner, startLeaf: number, endLeaf: number | null): Promise<void> {
	if (endLeaf === null || endLeaf === undefined || startLeaf > endLeaf) {
		throw new Error("[pinner] endLeaf must be a number and startLeaf must be less than or equal to endLeaf.")
	}

	console.log(`[pinner] Rebuilding and verifying local DAG from ${endLeaf - startLeaf} synced leaves...`)

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

export async function syncForward(params: {
	pinner: Pinner
	logBatchSize?: number
}): Promise<void> {
	let { pinner, logBatchSize } = params
	const batchSize = logBatchSize ?? 1000
	const { startBlock, endBlock } = await getSyncBlockRange(pinner)
	console.log(`[pinner] Syncing forward from block ${startBlock} to ${endBlock}...`)

	for (let from = startBlock; from <= endBlock; from += batchSize) {
		const to = Math.min(from + batchSize - 1, endBlock)

		console.log(`[pinner] Fetching logs from block ${from} to ${to}`)

		const filter = {
			address: pinner.contractAddress,
			...pinner.contract.filters.LeafInsert(),
			fromBlock: from,
			toBlock: to,
		}

		const logs: Log[] = await pinner.provider.getLogs(filter)

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
	console.log(`[pinner] Sync complete.`)
}

// Returns the best startBlock and endBlock for syncing based on DB, chain, and contract state
async function getSyncBlockRange(pinner: Pinner): Promise<{ startBlock: number; endBlock: number }> {
	const meta = await getAccumulatorData(pinner.provider, pinner.contractAddress)
	let startBlock = pinner.syncedToBlockNumber
	const select = pinner.db.prepare(`SELECT block_number FROM leaf_events WHERE leaf_index = ?`)
	const row = select.get(pinner.syncedToLeafIndex) as { block_number?: number } | undefined
	if (row && row.block_number) {
		if (row.block_number > startBlock) startBlock = row.block_number
		console.log(`[pinner] Found block number ${startBlock} for leaf index ${pinner.syncedToLeafIndex}`)
	} else {
		console.log(`[pinner] No block number found in DB for leaf index ${pinner.syncedToLeafIndex}`)
		console.log(`[pinner] Attempting to find the block for leaf index ${pinner.syncedToLeafIndex}...`)
		try {
			const blockNumber = await findBlockForLeafIndex({ provider: pinner.provider, contract: pinner.contract, leafIndex: pinner.syncedToLeafIndex, fromBlock: meta.deployBlockNumber })
			if (blockNumber) {
				if (blockNumber > startBlock) startBlock = blockNumber
				console.log(`[pinner] Found block number ${startBlock} for latest leaf index ${pinner.syncedToLeafIndex}`)
			} else {
				console.log(`[pinner] Failed to find block number for latest leaf index ${pinner.syncedToLeafIndex}. Starting from contract's deploy block.`)
			}
		} catch (e) {
			console.error(`[pinner] Failed to find block number for latest leaf index ${pinner.syncedToLeafIndex}. Starting from contract's deploy block.`)
		}
	}
	const endBlock = meta.previousInsertBlockNumber
	return { startBlock, endBlock }
}