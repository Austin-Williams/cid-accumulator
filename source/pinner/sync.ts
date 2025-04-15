import { Log } from 'ethers'
import { decodeLeafInsert } from '../shared/codec.ts'
import { retryRpcCall } from '../shared/rpc.ts'
import { Pinner } from './Pinner.ts'

export async function rebuildLocalDagForContiguousLeaves(
	pinner: Pinner,
	startLeaf = 0,
	endLeaf = pinner.highestContiguousLeafIndex()
): Promise<void> {
	if (endLeaf === null || startLeaf > endLeaf) {
		console.log('[pinner] No synced leaves to verify.')
		return
	}

	console.log(`[pinner] Rebuilding and verifying local DAG from ${endLeaf - startLeaf} synced leaves.`)

	const select = pinner.db.prepare(`SELECT data, cid, root_cid, combine_results, right_inputs FROM leaf_events WHERE leaf_index = ?`)
	const update = pinner.db.prepare(`UPDATE leaf_events SET cid = ?, root_cid = ?, combine_results = ?, right_inputs = ? WHERE leaf_index = ?`)
	const insertIntermediate = pinner.db.prepare(`INSERT OR IGNORE INTO intermediate_nodes (cid, data) VALUES (?, ?)`)

	for (let leafIndex = startLeaf; leafIndex <= endLeaf; leafIndex++) {
		const row = select.get(leafIndex) as {
			data: Buffer
			cid?: string
			root_cid?: string
			combine_results?: string
			right_inputs?: string
		} | undefined

		if (!row) {
			console.warn(`[pinner] Leaf index ${leafIndex} missing from DB unexpectedly.`)
			continue
		}

		const data = new Uint8Array(row.data)
		const {
			leafCID,
			rootCID,
			combineResultsCIDs,
			rightInputsCIDs,
			combineResultsData,
			peakBaggingCIDs,
			peakBaggingData
		} = await pinner.mmr.addLeafWithTrail(data, leafIndex)

		const needsUpdate =
			!row.cid || !row.root_cid || !row.combine_results || !row.right_inputs

		if (needsUpdate) {
			update.run(
				leafCID,
				rootCID,
				JSON.stringify(combineResultsCIDs),
				JSON.stringify(rightInputsCIDs),
				leafIndex
			)
			console.log(`[pinner] Updated leaf ${leafIndex} with CID and DAG info.`)

			for (let i = 0; i < combineResultsCIDs.length; i++) {
				insertIntermediate.run(combineResultsCIDs[i], combineResultsData[i])
			}
			for (let i = 0; i < peakBaggingCIDs.length; i++) {
				insertIntermediate.run(peakBaggingCIDs[i], peakBaggingData[i])
			}
		}

		if (row.root_cid !== rootCID) {
			throw new Error(`Integrity check failed at leafIndex ${leafIndex}: expected rootCID ${row.root_cid}, got ${rootCID}`)
		}
	}

	const setMeta = pinner.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`)
	setMeta.run('lastSyncedLeafIndex', String(endLeaf))
}

export async function syncFromEvents(
	pinner: Pinner,
	startBlock: number,
	lastSyncedLeafIndex: number,
	logBatchSize?: number,
	throttleSeconds?: number
): Promise<void> {
	const latestBlock = await retryRpcCall(() => pinner.provider.getBlockNumber())
	const batchSize = logBatchSize ?? 10000

	for (let from = startBlock; from <= latestBlock; from += batchSize) {
		if (throttleSeconds) await new Promise(r => setTimeout(r, throttleSeconds * 1000))
		const to = Math.min(from + batchSize - 1, latestBlock)
		console.log(`[pinner] Fetching logs from block ${from} to ${to}`)

		const logs: Log[] = await retryRpcCall(() =>
			pinner.provider.getLogs({
				...pinner.contract.filters.LeafInsert(),
				fromBlock: from,
				toBlock: to
			})
		)

		let expectedLeafIndex = lastSyncedLeafIndex + 1
		for (const log of logs) {
			const { leafIndex, previousInsertBlockNumber, newData } = decodeLeafInsert(log)

			if (leafIndex < expectedLeafIndex) continue
			if (leafIndex > expectedLeafIndex) {
				throw new Error(`[pinner] LeafIndex gap detected. Expected ${expectedLeafIndex}, got ${leafIndex}`)
			}

			await pinner.processLeafEvent({
				leafIndex,
				blockNumber: log.blockNumber,
				data: new Uint8Array(Buffer.from(newData.slice(2), 'hex')),
				previousInsertBlockNumber
			})
			expectedLeafIndex++
		}
	}
}