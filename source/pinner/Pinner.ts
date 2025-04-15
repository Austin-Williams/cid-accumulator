import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex } from '@noble/hashes/utils'
import { Web3Provider } from 'micro-eth-signer/net'
import { createContract } from 'micro-eth-signer/abi'

import { MerkleMountainRange } from '../shared/mmr.ts'
import { MINIMAL_ACCUMULATOR_ABI } from '../shared/constants.ts'

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

interface Log {
	topics: string[]
	data: string
	address: string
	blockNumber: string
	transactionHash: string
}

export interface LeafInsertEvent {
	leafIndex: number
	previousInsertBlockNumber: number
	newData: string
	combineResults: string[]
	rightInputs: string[]
}

export interface AccumulatorMetadata {
	peakHeights: number[]
	peakCount: number
	leafCount: number
	previousInsertBlockNumber: number
	deployBlockNumber: number
}

export class Pinner {
	private provider!: Web3Provider
	private contract!: any
	private contractAddress!: string
	private db!: Database.Database
	private dbPath!: string
	private mmr = new MerkleMountainRange()

	constructor(){}

	static async init(contractAddress: string, provider: Web3Provider): Promise<Pinner> {
		const pinner = new Pinner()

		pinner.provider = provider
		pinner.contract = createContract(MINIMAL_ACCUMULATOR_ABI)

		const chainIdHex = await provider.call('eth_chainId')
		const chainId = Number(BigInt(chainIdHex))

		const normalizedAddress = contractAddress.toLowerCase()
		pinner.contractAddress = normalizedAddress
		const label = `${chainId}-${normalizedAddress}`
		const labelBytes = new TextEncoder().encode(label)
		const labelHash = bytesToHex(keccak_256(labelBytes)).slice(0, 8)

		console.log(`[pinner] Initializing for contract ${normalizedAddress} on chainId ${chainId}`)
		console.log(`[pinner] Looking for DB at path: ${pinner.dbPath}`)

		fs.mkdirSync('.pinner', { recursive: true })
		pinner.dbPath = path.join('.pinner', `pinner-${labelHash}.db`)

		const dbAlreadyExists = fs.existsSync(pinner.dbPath)

		pinner.db = new Database(pinner.dbPath)
		pinner.db.pragma('journal_mode = WAL')

		const set = pinner.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`)
		const get = pinner.db.prepare(`SELECT value FROM meta WHERE key = ?`)

		if (!dbAlreadyExists) {
			console.log(`[pinner] No DB found for this contract at that path. Creating fresh DB.`)
			// Fresh DB setup
			pinner.db.exec(`
				CREATE TABLE IF NOT EXISTS leaf_events (
					leaf_index INTEGER PRIMARY KEY,
					block_number INTEGER,
					cid TEXT NOT NULL,
					data BLOB NOT NULL,
					previous_insert_block INTEGER,
					combine_results TEXT,
					right_inputs TEXT,
					root_cid TEXT,
					pinned BOOLEAN DEFAULT 0
				);
			
				CREATE INDEX IF NOT EXISTS idx_block_number ON leaf_events(block_number);
				CREATE INDEX IF NOT EXISTS idx_root_cid ON leaf_events(root_cid);
				CREATE INDEX IF NOT EXISTS idx_cid ON leaf_events(cid);
			
				CREATE TABLE IF NOT EXISTS intermediate_nodes (
					cid TEXT PRIMARY KEY,
					data BLOB NOT NULL,
					pinned BOOLEAN DEFAULT 0
				);
			`)

			set.run('contractAddress', normalizedAddress)
			set.run('chainId', String(chainId))

			console.log(`[pinner] Created new DB for this contract at: ${pinner.dbPath}`)
		} else {
			console.log(`[pinner] Loaded existing DB`)
			// Validate metadata
			const storedAddress = (get.get('contractAddress') as { value: string } | undefined)?.value
			const storedChainId = (get.get('chainId') as { value: string } | undefined)?.value

			if (storedAddress !== normalizedAddress) {
				throw new Error(`DB contract address mismatch: expected ${storedAddress}, got ${normalizedAddress}`)
			}
			if (storedChainId !== String(chainId)) {
				throw new Error(`DB chain ID mismatch: expected ${storedChainId}, got ${chainId}`)
			}
		}

		// Fetch mmrMetaBits and parse deployBlockNumber
		const [mmrMetaBits]: [bigint, any] = await pinner.contract.getAccumulatorData()
		const bits = mmrMetaBits
		const deployBlockNumber = Number((bits >> 229n) & 0x7FFFFFFn)

		// Check or store deployBlockNumber in meta
		const deployRow = get.get('deployBlockNumber') as { value: string } | undefined

		if (deployRow) {
			const stored = Number(deployRow.value)
			if (stored !== deployBlockNumber) {
				throw new Error(`DB deployBlockNumber mismatch: expected ${stored}, got ${deployBlockNumber}`)
			}
		} else {
			set.run('deployBlockNumber', String(deployBlockNumber))
		}

		return pinner
	}

	async rebuildLocalDagForSyncedLeaves(startLeaf = 0, endLeaf = this.highestContiguousLeafIndex()): Promise<void> {
		if (endLeaf === null || startLeaf > endLeaf) {
			console.log('[pinner] No synced leaves to verify.')
			return
		}

		console.log(`[pinner] Rebuilding and verifying local DAG from ${endLeaf - startLeaf} synced leaves.`)

		const select = this.db.prepare(`SELECT data, cid, root_cid, combine_results, right_inputs FROM leaf_events WHERE leaf_index = ?`)
		const update = this.db.prepare(`UPDATE leaf_events SET cid = ?, root_cid = ?, combine_results = ?, right_inputs = ? WHERE leaf_index = ?`)
		const insertIntermediate = this.db.prepare(`
			INSERT OR IGNORE INTO intermediate_nodes (cid, data) VALUES (?, ?)
		`)
	
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
			} = await this.mmr.addLeafWithTrail(data, leafIndex)
	
			const needsUpdate =
				!row.cid ||
				!row.root_cid ||
				!row.combine_results ||
				!row.right_inputs
	
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
	
				// Also persist any final root-level merge steps
				for (let i = 0; i < peakBaggingCIDs.length; i++) {
					insertIntermediate.run(peakBaggingCIDs[i], peakBaggingData[i])
				}
			}
	
			// Always verify root CID matches stored value
			if (row.root_cid !== rootCID) {
				throw new Error(`Integrity check failed at leafIndex ${leafIndex}: expected rootCID ${row.root_cid}, got ${rootCID}`)
			}
		}

		const setMeta = this.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`)
		setMeta.run('lastSyncedLeafIndex', String(endLeaf))
	}

	decodeLeafInsert(log: Log): LeafInsertEvent {
		const decoded = this.contract.LeafInsert.decode(log.topics, log.data)
	
		return {
			leafIndex: Number(decoded.leafIndex),
			previousInsertBlockNumber: Number(decoded.previousInsertBlockNumber),
			newData: decoded.newData,
			combineResults: decoded.combineResults,
			rightInputs: decoded.rightInputs
		}
	}

	async getAccumulatorMetadata(): Promise<AccumulatorMetadata> {
		const [mmrMetaBits]: [bigint, any] = await this.contract.getAccumulatorData()
		const bits = mmrMetaBits
		const peakHeights: number[] = []
		for (let i = 0; i < 32; i++) {
			peakHeights.push(Number((bits >> BigInt(i * 5)) & 0x1Fn))
		}
		const peakCount = Number((bits >> 160n) & 0x1Fn)
		const leafCount = Number((bits >> 165n) & 0xFFFFFFFFn)
		const previousInsertBlockNumber = Number((bits >> 197n) & 0xFFFFFFFFn)
		const deployBlockNumber = Number((bits >> 229n) & 0x7FFFFFFn)

		return {
			peakHeights,
			peakCount,
			leafCount,
			previousInsertBlockNumber,
			deployBlockNumber,
		}
	}

	async processLeafEvent(params: {
		leafIndex: number
		blockNumber?: number
		data: Uint8Array
		previousInsertBlockNumber?: number
	}): Promise<void> {
		const {
			leafIndex,
			blockNumber,
			data,
			previousInsertBlockNumber
		} = params
	
		const {
			leafCID,
			rootCID,
			combineResultsCIDs,
			rightInputsCIDs,
			combineResultsData,
			peakBaggingCIDs,
			peakBaggingData
		} = await this.mmr.addLeafWithTrail(data, leafIndex)
	
		this.db.prepare(`
			INSERT OR REPLACE INTO leaf_events (
				leaf_index,
				block_number,
				cid,
				data,
				previous_insert_block,
				combine_results,
				right_inputs,
				root_cid,
				pinned
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			leafIndex,
			blockNumber ?? null,
			leafCID,
			Buffer.from(data),
			previousInsertBlockNumber ?? null,
			JSON.stringify(combineResultsCIDs),
			JSON.stringify(rightInputsCIDs),
			rootCID,
			0
		)
	
		const insertIntermediate = this.db.prepare(`
			INSERT OR IGNORE INTO intermediate_nodes (cid, data) VALUES (?, ?)
		`)
	
		for (let i = 0; i < combineResultsCIDs.length; i++) {
			insertIntermediate.run(combineResultsCIDs[i], combineResultsData[i])
		}
	
		for (let i = 0; i < peakBaggingCIDs.length; i++) {
			insertIntermediate.run(peakBaggingCIDs[i], peakBaggingData[i])
		}
	
		const setMeta = this.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`)
		setMeta.run('lastSyncedLeafIndex', String(leafIndex))
	
		console.log(`[pinner] Processed and inserted leaf ${leafIndex}`)
	}

	async syncFromEvents(
		startBlock: number,
		lastSyncedLeafIndex: number,
		logBatchSize?: number,
		throttleSeconds?: number
	): Promise<void> {
		const latest = await this.retryRpcCall(() => this.provider.call('eth_blockNumber', []))
		const latestBlock = parseInt(latest, 16)
		const batchSize = logBatchSize ?? 10000
	
		for (let from = startBlock; from <= latestBlock; from += batchSize) {
			if (throttleSeconds) await new Promise(r => setTimeout(r, throttleSeconds * 1000))
			const to = Math.min(from + batchSize - 1, latestBlock)
			console.log(`[pinner] Fetching logs from block ${from} to ${to}`)
	
			const chunk = await this.retryRpcCall(() => this.provider.call('eth_getLogs', [{
				fromBlock: `0x${from.toString(16)}`,
				toBlock: `0x${to.toString(16)}`,
				address: this.contractAddress,
				topics: [this.contract.LeafInsert.topic]
			}]))
	
			let expectedLeafIndex = lastSyncedLeafIndex + 1
			for (const log of chunk) {
				const { leafIndex, previousInsertBlockNumber, newData } = this.decodeLeafInsert(log)
				if (leafIndex < expectedLeafIndex) continue
				if (leafIndex > expectedLeafIndex) {
					throw new Error(`[pinner] LeafIndex gap detected. Expected ${expectedLeafIndex}, got ${leafIndex}`)
				}
				const blockNumber = parseInt(log.blockNumber, 16)
				await this.processLeafEvent({
					leafIndex,
					blockNumber,
					data: new Uint8Array(Buffer.from(newData.slice(2), 'hex')),
					previousInsertBlockNumber
				})
				expectedLeafIndex++
			}
		}
	}
		
	private async retryRpcCall<T>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
		for (let attempt = 0; attempt <= retries; attempt++) {
			try {
				return await fn()
			} catch (err) {
				if (attempt === retries) throw err
				const backoff = Math.min(delayMs * 2 ** attempt, 30000) // max 30s cap
				const jitter = Math.floor(Math.random() * 1000) // up to 1s jitter
				const wait = backoff + jitter
				console.warn(`[pinner] RPC call failed (attempt ${attempt + 1}/${retries}). Retrying in ${wait}ms...`)
				await new Promise(res => setTimeout(res, wait))
			}
		}
		throw new Error('Unreachable')
	}

	// Returns the highest leafIndex N such that all leafIndexes [0...N]
	// are present in the DB with no gaps.
	// This does NOT guarantee that intermediate or root CIDs are present,
	// nor that the DAG structure has been resolved.
	highestContiguousLeafIndex(): number | null {
		const rows = this.db.prepare(`
			SELECT leaf_index
			FROM leaf_events
			ORDER BY leaf_index ASC
		`).all() as { leaf_index: number }[]

		for (let i = 0; i < rows.length; i++) {
			if (rows[i].leaf_index !== i) {
				return i === 0 ? null : i - 1
			}
		}

		return rows.length > 0 ? rows.length - 1 : null
	}
}

