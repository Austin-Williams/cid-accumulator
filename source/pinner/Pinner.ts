import { ethers } from "ethers"
import { keccak_256 } from "@noble/hashes/sha3"
import { bytesToHex } from "@noble/hashes/utils"

import { MerkleMountainRange } from "../shared/mmr.ts"
import { MINIMAL_ACCUMULATOR_ABI } from "../shared/constants.ts"
import { rebuildLocalDag } from "./sync.ts"
import { AccumulatorMetadata } from "../shared/types.ts"
import { getAccumulatorData } from "../shared/accumulator.ts"
import { initializeSchema, openOrCreateDatabase, createMetaHandlers } from "./db.ts"

import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

export class Pinner {
	public provider!: ethers.JsonRpcProvider
	public contract!: ethers.Contract
	public contractAddress!: string
	public db!: Database.Database
	public mmr = new MerkleMountainRange()
	public syncedToLeafIndex!: number

	constructor() {}

	static async init(contractAddress: string, provider: ethers.JsonRpcProvider): Promise<Pinner> {
		const pinner = new Pinner()
		pinner.syncedToLeafIndex = -1

		pinner.provider = provider
		const normalizedAddress = contractAddress.toLowerCase()
		pinner.contractAddress = normalizedAddress

		pinner.contract = new ethers.Contract(normalizedAddress, MINIMAL_ACCUMULATOR_ABI, provider)

		const network = await provider.getNetwork()
		const chainId = Number(network.chainId)

		const label = `${chainId}-${normalizedAddress}`
		const labelBytes = new TextEncoder().encode(label)
		const labelHash = bytesToHex(keccak_256(labelBytes)).slice(0, 8)

		console.log(`[pinner] Creating pinner for contract ${normalizedAddress} on chainId ${chainId}`)

		const dbPath = path.join(".pinner", `pinner-${labelHash}.db`)
		console.log(`[pinner] Looking for DB at path: ${dbPath}`)

		const dbAlreadyExists = fs.existsSync(dbPath)
		pinner.db = openOrCreateDatabase(dbPath)

		if (!dbAlreadyExists) {
			console.log(`[pinner] No DB found for this contract. Creating fresh DB.`)
			initializeSchema(pinner.db)
			console.log(`[pinner] Created new DB at: ${dbPath}`)
		} else {
			console.log(`[pinner] Loaded existing DB`)
		}

		const { getMeta, setMeta } = createMetaHandlers(pinner.db)
		const storedAddress = getMeta("contractAddress")
		const storedChainId = getMeta("chainId")

		if (storedAddress && storedAddress !== normalizedAddress) {
			throw new Error(`DB contract address mismatch: expected ${storedAddress}, got ${normalizedAddress}`)
		}
		if (storedChainId && storedChainId !== String(chainId)) {
			throw new Error(`DB chain ID mismatch: expected ${storedChainId}, got ${chainId}`)
		}

		setMeta("contractAddress", normalizedAddress)
		setMeta("chainId", String(chainId))

		const [mmrMetaBits]: [bigint, any] = await pinner.contract.getAccumulatorData()
		const bits = mmrMetaBits
		const deployBlockNumber = Number((bits >> 229n) & 0x7ffffffn)

		const storedDeployBlock = getMeta("deployBlockNumber")
		if (storedDeployBlock && Number(storedDeployBlock) !== deployBlockNumber) {
			throw new Error(`DB deployBlockNumber mismatch: expected ${storedDeployBlock}, got ${deployBlockNumber}`)
		}
		setMeta("deployBlockNumber", String(deployBlockNumber))

		console.log("[pinner] Pinner created. You MUST call this.initialize() before use.")

		return pinner
	}

	async initialize(): Promise<void> {
		console.log('[pinner] Initializing...')
		const highestContiguousLeafIndex = this.highestContiguousLeafIndex();
		if (typeof highestContiguousLeafIndex === 'number' && highestContiguousLeafIndex >= 0) {
			await this.rebuildLocalDag(0, highestContiguousLeafIndex)
			console.log(`[pinner] Pinner initialized. Synced to leaf index ${this.syncedToLeafIndex}. Total leaves synced: ${this.syncedToLeafIndex + 1}`)
		} else {
			console.log(`[pinner] Pinner initialized. No leaves synced.`)
		}
	}

	async rebuildLocalDag(startLeaf: number, endLeaf: number): Promise<void> {
		await rebuildLocalDag(this, startLeaf, endLeaf)
	}

	async getAccumulatorData(): Promise<AccumulatorMetadata> {
		return await getAccumulatorData(this.provider, this.contractAddress)
	}

	/**
	 * Processes a new leaf event from the blockchain:
	 * - Calls MerkleMountainRange.addLeafWithTrail to add a new leaf to the MMR and get all intermediate node CIDs and data..
	 * - Persists the resulting CIDs and associated data (leaf, combineResults, peaks, etc.) in the DB.
	 * - Stores the blockNumber and previousInsertBlockNumber (if available) for provenance.
	 * - Increments syncedToLeafIndex if successful.
	 *
	 * This is the ONLY function in the codebase allowed to increment this.syncedToLeafIndex.
	 * 
	 * @param params - The event data including:
	 *   - leafIndex: The expected index for the new leaf.
	 *   - blockNumber: (Optional) The block number associated with this leaf event.
	 *   - data: The raw data for the new leaf.
	 *   - previousInsertBlockNumber: (Optional) The block number of the previous insert event.
	 */
	async processLeafEvent(params: {
		leafIndex: number
		blockNumber?: number
		data: Uint8Array
		previousInsertBlockNumber?: number
	}): Promise<void> {
		const { leafIndex, blockNumber, data, previousInsertBlockNumber } = params

		const {
			leafCID,
			rootCID,
			combineResultsCIDs,
			rightInputsCIDs,
			combineResultsData,
			peakBaggingCIDs,
			peakBaggingData,
		} = await this.mmr.addLeafWithTrail(data, leafIndex)

		this.db
			.prepare(
				`
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
		`,
			)
			.run(
				leafIndex,
				blockNumber ?? null,
				leafCID,
				Buffer.from(data),
				previousInsertBlockNumber ?? null,
				JSON.stringify(combineResultsCIDs),
				JSON.stringify(rightInputsCIDs),
				rootCID,
				0,
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
		setMeta.run("lastSyncedLeafIndex", String(leafIndex))

		console.log(`[pinner] Processed and inserted leaf ${leafIndex}`)
		if (this.syncedToLeafIndex == null) {
			throw new Error("syncedToLeafIndex is null in processLeafEvent. This should never happen.")
		}

		// Verify that leafIndex === this.syncedToLeafIndex and throw if not
		if (leafIndex !== this.syncedToLeafIndex) {
			throw new Error(`leafIndex (${leafIndex}) !== syncedToLeafIndex (${this.syncedToLeafIndex}) in processLeafEvent. This indicates a logic error.`)
		}

		this.syncedToLeafIndex++
	}

	async syncForward(
		startBlock: number,
		lastSyncedLeafIndex: number,
		logBatchSize?: number,
		throttleSeconds?: number,
	): Promise<void> {
		const { syncForward } = await import("./sync.ts")
		return syncForward(this, startBlock, lastSyncedLeafIndex, logBatchSize, throttleSeconds)
	}

	// Returns the highest leafIndex N such that all leafIndexes [0...N]
	// are present in the DB with no gaps.
	// This does NOT guarantee that intermediate or root CIDs are present,
	// nor that the DAG structure has been resolved.
	highestContiguousLeafIndex(): number | null {
		const rows = this.db
			.prepare(
				`
			SELECT leaf_index
			FROM leaf_events
			ORDER BY leaf_index ASC
		`,
			)
			.all() as { leaf_index: number }[]

		for (let i = 0; i < rows.length; i++) {
			if (rows[i].leaf_index !== i) {
				return i === 0 ? null : i - 1
			}
		}

		return rows.length > 0 ? rows.length - 1 : null
	}
}
