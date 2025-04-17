import { ethers } from "ethers"
import { CID } from "multiformats/cid"

import { MerkleMountainRange } from "../shared/mmr.ts"
import { MINIMAL_ACCUMULATOR_ABI } from "../shared/constants.ts"
import { initializeSchema, openOrCreateDatabase, createMetaHandlers } from "./db.ts"

import Database from "better-sqlite3"
import path from "path"
import fs from "fs"
import { getLeafInsertLog, walkBackLeafInsertLogsOrThrow } from "../shared/logs.ts"
import { LeafInsertEvent } from "../shared/types.ts"

export class Pinner {
	public provider!: ethers.JsonRpcProvider
	public contract!: ethers.Contract
	public contractAddress!: string
	public contractDeployBlockNumber!: number
	public db!: Database.Database
	public mmr = new MerkleMountainRange()
	public syncedToLeafIndex!: number
	public syncedToBlockNumber!: number

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

		console.log(`[pinner] Initializing pinner for contract ${normalizedAddress} on chainId ${chainId}`)

		const dbPath = path.join(".pinner", `pinner-${label}.db`)
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
		pinner.contractDeployBlockNumber = Number((bits >> 229n) & 0x7ffffffn)
		pinner.syncedToBlockNumber = pinner.contractDeployBlockNumber - 1

		const storedDeployBlock = getMeta("deployBlockNumber")
		if (storedDeployBlock && Number(storedDeployBlock) !== pinner.contractDeployBlockNumber) {
			throw new Error(
				`DB deployBlockNumber mismatch: expected ${storedDeployBlock}, got ${pinner.contractDeployBlockNumber}`,
			)
		}
		setMeta("deployBlockNumber", String(pinner.contractDeployBlockNumber))

		console.log("[pinner] Initializing...")
		const highestContiguousLeafIndex = pinner.highestContiguousLeafIndex()
		if (typeof highestContiguousLeafIndex === "number" && highestContiguousLeafIndex >= 0) {
			await pinner.rebuildLocalDag(0, highestContiguousLeafIndex)
			console.log(
				`[pinner] Pinner initialized. Synced to leaf index ${pinner.syncedToLeafIndex}. Total leaves synced: ${pinner.syncedToLeafIndex + 1}`,
			)
		} else {
			console.log(`[pinner] Pinner initialized. No leaves synced.`)
		}

		return pinner
	}

	/**
	 * Retrieves accumulator data from the chain for this pinner's provider and contractAddress.
	 */
	async getAccumulatorData() {
		// Importing here for easier mocking in tests
		const { getAccumulatorData } = await import("../shared/accumulator.ts")
		return getAccumulatorData(this.provider, this.contractAddress)
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
	 *   - data: The raw data for the new leaf.
	 *   - blockNumber: (Optional) The block number associated with this leaf event.
	 *   - previousInsertBlockNumber: (Optional) The block number of the previous insert event; Used for walking back to catch up on missing leaves.
	 */
	async processLeafEvent(params: {
		leafIndex: number
		newData: Uint8Array
		blockNumber?: number
		previousInsertBlockNumber?: number
	}): Promise<void> {
		const { leafIndex, blockNumber, newData, previousInsertBlockNumber } = params
		// If we detect a gap in leaves, try to fetch them and process them.
		if (leafIndex > this.syncedToLeafIndex + 1) {
			console.log(
				`[pinner] Missing leafs ${this.syncedToLeafIndex + 1} to ${leafIndex -1}. Attmempting to fetch them...`,
			)
			if (previousInsertBlockNumber === undefined) {
				throw new Error(`Missing previousInsertBlockNumber for leafIndex ${leafIndex}. Cannot fetch missing leaves.`)
			}
			const missingLeaves: LeafInsertEvent[] = await walkBackLeafInsertLogsOrThrow({
				provider: this.provider,
				contract: this.contract,
				fromLeafIndex: leafIndex - 1,
				fromLeafIndexBlockNumber: previousInsertBlockNumber,
				toLeafIndex: this.syncedToLeafIndex + 1,
			})
			console.log(`[pinner] Fetched ${missingLeaves.length} missing leafs. Processing them...`)

			for (const event of missingLeaves) {
				await this.processLeafEvent(event)
			}
			console.log(`[pinner] Processed ${missingLeaves.length} missing leafs. All caught up.`)
		}

		// Add the new leaf to the MMR
		const {
			leafCID,
			rootCID,
			combineResultsCIDs,
			rightInputsCIDs,
			combineResultsData,
			peakBaggingCIDs,
			peakBaggingData,
		} = await this.mmr.addLeafWithTrail(newData, leafIndex)

		// Persist the new leaf and related data in our DB
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
				newData,
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

		if (this.syncedToLeafIndex == null) {
			throw new Error("syncedToLeafIndex is null in processLeafEvent. This should never happen.")
		}

		this.syncedToLeafIndex++

		// Verify that leafIndex === this.syncedToLeafIndex and throw if not
		if (leafIndex !== this.syncedToLeafIndex) {
			throw new Error(
				`[pinner] leafIndex (${leafIndex}) !== syncedToLeafIndex (${this.syncedToLeafIndex}) in processLeafEvent. This indicates a logic error.`,
			)
		}

		if (blockNumber !== undefined && blockNumber > this.syncedToBlockNumber) {
			this.syncedToBlockNumber = blockNumber
		}
	}

	// Best when you are very far behind in syncing.
	// Fewer RPC calls but each with a very large block range.
	async syncForward(params?: { logBatchSize?: number }): Promise<void> {
		const { syncForward } = await import("./sync.ts")
		return await syncForward({ pinner: this, ...params })
	}
	// Best when you are close to the tip of the chain.
	// Many more RPC calls but each with a single block in the block range and exactly one log returned.
	async syncBackward(): Promise<void> {
		// get most recent leaf index from contract
		const contractMetadata = await this.getAccumulatorData()
		// get highest contiguous leaf index from DB
		let oldestLeafIndex: number = this.syncedToLeafIndex
		if (oldestLeafIndex === null) {
			throw new Error("[pinner] syncedToLeafIndex is null in syncBackward. This should never happen.")
		}
		if (oldestLeafIndex > contractMetadata.leafCount - 1) {
			throw new Error(`[pinner] this.syncedToLeafIndex is ${oldestLeafIndex}, which is greater than the latest leaf index on chain (${contractMetadata.leafCount - 1}). This should never happen.`)
		}
		if (oldestLeafIndex === contractMetadata.leafCount - 1) {
			console.log("[pinner] Already synced to the latest leaf index. No need to sync backward.")
			return
		}
			
		console.log(`[pinner] Syncing backward from leaf index ${contractMetadata.leafCount - 1} to leaf index ${oldestLeafIndex + 1}...`,)

		// get the event for mostRecentLeafIndex
		const mostRecentLog = await getLeafInsertLog({
			provider: this.provider,
			contract: this.contract,
			targetLeafIndex: contractMetadata.leafCount - 1,
			fromBlock: contractMetadata.previousInsertBlockNumber,
			toBlock: contractMetadata.previousInsertBlockNumber,
		})

		if (!mostRecentLog) throw new Error("[pinner] Log for most recent leaf index not found on chain.")
		
		await this.processLeafEvent(mostRecentLog)

		console.log("[pinner] Syncing backward complete.")
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

	async verifyRootCID(): Promise<void> {
		console.log("[pinner] Verifying root CID...")
		const contractRootCIDHex = await this.contract.getLatestCID()
		const contractRootCIDBase32: string = CID.decode(
			Uint8Array.from(Buffer.from(contractRootCIDHex.slice(2), "hex")),
		).toString()
		const pinnerRootCID = await this.mmr.rootCIDAsBase32()
		if (pinnerRootCID !== contractRootCIDBase32) {
			console.error(
				`[pinner] ❌ FAIL: Root CID mismatch.\n Contract root CID: ${contractRootCIDBase32}\nPinner root CID: ${pinnerRootCID}`,
			)
		} else {
			console.log("[pinner] ✅ PASS: Root CID matches contract")
		}
	}
}
