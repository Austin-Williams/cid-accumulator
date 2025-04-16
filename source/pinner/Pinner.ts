import { ethers } from "ethers"
import { keccak_256 } from "@noble/hashes/sha3"
import { bytesToHex } from "@noble/hashes/utils"

import { MerkleMountainRange } from "../shared/mmr.ts"
import { MINIMAL_ACCUMULATOR_ABI } from "../shared/constants.ts"
import { initializeSchema, openOrCreateDatabase, createMetaHandlers } from "./db.ts"

import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

export class Pinner {
  /**
   * Retrieves accumulator data from the chain for this pinner's provider and contractAddress.
   */
  async getAccumulatorData() {
    // Importing here for easier mocking in tests
    const { getAccumulatorData } = await import("../shared/accumulator.ts")
    return getAccumulatorData(this.provider, this.contractAddress)
  }
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

		console.log(`[pinner] Initializing pinner for contract ${normalizedAddress} on chainId ${chainId}`)

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

		console.log('[pinner] Initializing...')
		const highestContiguousLeafIndex = pinner.highestContiguousLeafIndex();
		if (typeof highestContiguousLeafIndex === 'number' && highestContiguousLeafIndex >= 0) {
			await pinner.rebuildLocalDag(0, highestContiguousLeafIndex)
			console.log(`[pinner] Pinner initialized. Synced to leaf index ${pinner.syncedToLeafIndex}. Total leaves synced: ${pinner.syncedToLeafIndex + 1}`)
		} else {
			console.log(`[pinner] Pinner initialized. No leaves synced.`)
		}

		return pinner
	}

	/**
	 * Rebuilds and verifies the local Directed Acyclic Graph (DAG) for the pinner's Merkle Mountain Range (MMR)
	 * between the specified leaf indices (inclusive).
	 *
	 * This method is typically called during initialization or resynchronization to ensure that the local state
	 * matches the on-chain accumulator. It will throw an error if the arguments are invalid (e.g., endLeaf is null/undefined,
	 * or startLeaf > endLeaf).
	 *
	 * @param startLeaf - The starting leaf index (inclusive) for rebuilding the DAG.
	 * @param endLeaf - The ending leaf index (inclusive) for rebuilding the DAG.
	 * @throws {Error} If endLeaf is null/undefined or startLeaf > endLeaf.
	 *
	 * Example usage:
	 *   await pinner.rebuildLocalDag(0, 100)
	 */

	async rebuildLocalDag(startLeaf: number, endLeaf: number): Promise<void> {
	  // Delegate to the imported function for testability
	  const { rebuildLocalDag } = await import("./sync.ts")
	  return rebuildLocalDag(this, startLeaf, endLeaf)
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
		data: Uint8Array
		blockNumber?: number
		previousInsertBlockNumber?: number
	}): Promise<void> {
		const { leafIndex, blockNumber, data, previousInsertBlockNumber } = params
		// TODO: This will be the next thing we work on.
		// we'll start by making a simple function (in shared/) that tries to retreive the log for a given index,
		// and takes in an optional previousInsertBlockNumber param.
		// Then we'll create another function (also in shared) that will call that repeatedly to walk back
		// along the previousInsertBlockNumber chain until we reach the desired leafIndex (and throw if we 
		// can't walk back along that chain for any reason). This function should return an array of those logs
		// in order from oldest to newest.
		// Then this current function that we are in now (processLeafEvent) will walk through that array and 
		// and call processLeafEvent for each log.
		// Lets be sure to do good console logging in this process so we can debug if needed.
		/** TODO: check that the leafIndex matches this.syncedToLeafIndex + 1
		*		if it does not, then try to follow the previousInsertBlockNumber chain back to 
		* 	leadfIndex + 1 and then replay forward to here.
		* 	If that walkback fails, throw an error here.
		* This will make this function much more robust when processing live events.
		*/
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

		this.syncedToLeafIndex++

		// Verify that leafIndex === this.syncedToLeafIndex and throw if not
		if (leafIndex !== this.syncedToLeafIndex) {
			throw new Error(`[pinner] leafIndex (${leafIndex}) !== syncedToLeafIndex (${this.syncedToLeafIndex}) in processLeafEvent. This indicates a logic error.`)
		}
	}

	// TODO: I think this is finished. Need to test it now using real data.
	async syncForward(
		startBlock: number,
		logBatchSize?: number,
		throttleSeconds?: number,
	): Promise<void> {
		const { syncForward } = await import("./sync.ts")
		return syncForward(this, startBlock, logBatchSize, throttleSeconds)
	}

	// Returns the highest leafIndex N such that all leafIndexes [0...N]
	// are present in the DB with no gaps.
	// This does NOT guarantee that intermediate or root CIDs are present in the DB,
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
