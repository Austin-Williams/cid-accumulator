import * as dagCbor from "../utils/dagCbor.ts"
import { CID } from "../utils/CID.ts"
import type { IpfsAdapter } from "../interfaces/IpfsAdapter.ts"
import type { AccumulatorClientConfig } from "../types/types.ts"
import type { StorageAdapter } from "../interfaces/StorageAdapter.ts"
import type {
	PeakWithHeight,
	LeafRecord,
	NormalizedLeafInsertEvent,
	MMRLeafInsertTrail,
	DagCborEncodedData,
	CIDDataPair,
} from "../types/types.ts"

import { getAccumulatorData, getLeafInsertLogs, getLatestCID } from "../ethereum/commonCalls.ts"
import { ethRpcFetch } from "../ethereum/ethRpcFetch.ts"
import { MerkleMountainRange } from "./MerkleMountainRange.ts"
import { computePreviousRootCIDAndPeaksWithHeights, getRootCIDFromPeaks } from "./mmrUtils.ts"
import { walkBackLeafInsertLogsOrThrow } from "../utils/walkBackLogsOrThrow.ts"
import { resolveMerkleTreeOrThrow } from "../ipfs/ipfs.ts"
import { isNodeJs } from "../utils/envDetection.ts"
import { NULL_CID } from "../utils/constants.ts"
import {
	cidDataPairToStringForDB,
	uint8ArrayToHexString,
	normalizedLeafInsertEventToString,
	peakWithHeightArrayToStringForDB,
	hexStringToUint8Array,
	stringToNormalizedLeafInsertEvent,
	stringToPeakWithHeightArray,
	stringFromDBToCIDDataPair,
	getLeafRecordFromNormalizedLeafInsertEvent,
} from "../utils/codec.ts"
import { verifyCIDAgainstDagCborEncodedDataOrThrow } from "../utils/verifyCID.ts"

/**
 * AccumulatorClient: Unified entry point for accumulator logic in any environment.
 * Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
 */
export class AccumulatorClient {
	ipfs: IpfsAdapter
	storage: StorageAdapter
	ethereumHttpRpcUrl: string
	ethereumWsRpcUrl?: string
	contractAddress: string
	mmr: MerkleMountainRange
	highestCommittedLeafIndex: number

	shouldPut: boolean
	shouldPin: boolean
	shouldProvide: boolean

	private _liveSyncRunning: boolean = false
	private _liveSyncInterval?: ReturnType<typeof setTimeout>
	private _lastProcessedBlock: number = 0
	private _ws?: WebSocket

	constructor(
		config: AccumulatorClientConfig & {
			ipfs: IpfsAdapter
			storage: StorageAdapter
		},
	) {
		this.ipfs = config.ipfs
		this.storage = config.storage
		this.ethereumHttpRpcUrl = config.ETHEREUM_HTTP_RPC_URL
		this.ethereumWsRpcUrl = config.ETHEREUM_WS_RPC_URL
		this.contractAddress = config.CONTRACT_ADDRESS
		this.mmr = new MerkleMountainRange()
		this.highestCommittedLeafIndex = -1
		this.shouldPut = config.IPFS_PUT_IF_POSSIBLE && config.IPFS_API_URL !== undefined
		this.shouldPin = config.IPFS_PIN_IF_POSSIBLE && config.IPFS_API_URL !== undefined
		this.shouldProvide = config.IPFS_PROVIDE_IF_POSSIBLE && config.IPFS_API_URL !== undefined && isNodeJs()

		if (!this.shouldPut) this.shouldPin = false // Doesn't make sense to pin if they don't put
		if (!this.shouldPin) this.shouldProvide = false // Doesn't make sense to provide if they don't pin
	}

	async start() {
		await this.init()
		await this.syncBackwardsFromLatest()
		await this.rebuildAndProvideMMR()
		this.rePinAllDataToIPFS() // Runs in background, no-ops if this.shouldPin is false
		await this.startLiveSync()
	}

	// ================================================
	// 		SETUP, SYNCHRONIZATION, & SHUTDOWN
	// Handles node setup, connection checks, and
	// backfilling state from on-chain and IPFS data.
	// ================================================

	async init() {
		// Ensure DB is open
		await this.storage.open()

		// Log how many leafs we have in the DB
		const highestLeafIndexInDB = await this.getHighestContiguousLeafIndexWithData()
		console.log(`[Accumulator] \u{1F4E4} Found ${highestLeafIndexInDB + 1} leafs in DB`)

		// Check if Ethereum connection is working
		console.log("[Accumulator] \u{1F440} Checking Ethereum connection...")
		try {
			// Use eth_chainId as a lightweight check
			const chainId = await ethRpcFetch(this.ethereumHttpRpcUrl, "eth_chainId", [])
			console.log(`[Accumulator] \u{2705} Connected to Ethereum node, chainId: ${chainId}`)
		} catch (e) {
			console.error("[Accumulator] \u{274C} Failed to connect to Ethereum node:", e)
			throw new Error("Failed to connect to Ethereum node. See above error.")
		}

		// Check if IPFS Gateway connection is working
		console.log("[Accumulator] \u{1F440} Checking IPFS Gateway connection...")
		try {
			// Attempt to fetch a block
			await this.ipfs.getBlock(NULL_CID)
			console.log("[Accumulator] \u{2705} Connected to IPFS Gateway.")
		} catch (e) {
			console.error("[Accumulator] \u{274C} Failed to connect to IPFS Gateway:", e)
			throw new Error("Failed to connect to IPFS Gateway. Must abort. See above error.")
		}

		// If relevant, check that IPFS API connection can PUT/PIN
		if (this.shouldPut) {
			console.log("[Accumulator] \u{1F440} Checking IPFS API connection (attempting to PUT a block)...")
			try {
				// Attempt to put a block
				await this.ipfs.putBlock(NULL_CID, dagCbor.encode(null))
				console.log("[Accumulator] \u{2705} Connected to IPFS API and verified it can PUT blocks.")
			} catch (e) {
				this.shouldPut = false
				this.shouldPin = false
				console.error("[Accumulator] \u{274C} Failed to connect to IPFS API:", e)
				console.log("[Accumulator] 🤷‍♂️ Will continue without IPFS API connection (Using IPFS Gateway only).")
			}
		}

		// If relevant, check that IPFS API connection can PUT/PIN
		if (this.shouldProvide && this.shouldPut) {
			console.log("[Accumulator] \u{1F440} Checking if IPFS API can provide (advertise) blocks...")
			try {
				// Attempt to provide a block
				await this.ipfs.provide(NULL_CID)
				console.log("[Accumulator] \u{2705} Connected to IPFS API and verified it can PROVIDE blocks.")
			} catch (e) {
				this.shouldProvide = false
				console.error("[Accumulator] \u{274C} Failed to verify that the IPFS API can provide (advertise) blocks.", e)
				console.log("[Accumulator] 🤷‍♂️ Will continue without telling IPFS API to provide (advertise) blocks.")
			}
		}
		console.log("[Accumulator] \u{2705} Successfully initialized. Summary:")
		console.log(`[Accumulator] 📜 Summary: IPFS Gateway connected: YES`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PUT is set up: ${this.shouldPut ? "YES" : "NO"}`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PIN is set up: ${this.shouldPin ? "YES" : "NO"}`)
		console.log(`[Accumulator] 📜 Summary: IPFS API PROVIDE is set up: ${this.shouldProvide ? "YES" : "NO"}`)
	}

	/**
	 * Syncs backwards from the latest leaf/block, fetching events and storing by leafIndex.
	 * Uses on-chain metadata to determine where to start.
	 */
	async syncBackwardsFromLatest(maxBlockRange = 1000): Promise<void> {
		const { meta, peaks } = await getAccumulatorData(this.ethereumHttpRpcUrl, this.contractAddress)
		const currentLeafIndex = meta.leafCount - 1
		const currentBlock = meta.previousInsertBlockNumber
		const minBlock = meta.deployBlockNumber
		this._lastProcessedBlock = meta.previousInsertBlockNumber

		const highestLeafIndexInDB = await this.getHighestContiguousLeafIndexWithData()

		console.log(
			`[Accumulator] \u{1F501} Syncing backwards from block ${meta.previousInsertBlockNumber} to block ${meta.deployBlockNumber} (${meta.previousInsertBlockNumber - meta.deployBlockNumber} blocks), grabbing ${maxBlockRange} blocks per RPC call.`,
		)
		console.log(`[Accumulator] \u{1F50E} Simultaneously checking IPFS for older root CIDs as we discover them.`)

		// Compute the current root CID from the current peaks
		const currentRootCID = await getRootCIDFromPeaks(peaks.map((p) => p.cid))

		let oldestRootCid: CID<unknown, 113, 18, 1> = currentRootCID
		let oldestProcessedLeafIndex = currentLeafIndex + 1
		let currentPeaksWithHeights: PeakWithHeight[] = peaks

		const ipfsChecks: Array<
			ReturnType<typeof makeTrackedPromise<boolean>> & { controller: AbortController; cid: CID<unknown, 113, 18, 1> }
		> = []

		// --- Utility: tracked promise for polling ---
		function makeTrackedPromise<T>(promise: Promise<T>) {
			let isFulfilled = false
			let value: T | undefined
			const tracked = promise.then((v) => {
				isFulfilled = true
				value = v
				return v
			})
			return { promise: tracked, isFulfilled: () => isFulfilled, getValue: () => value }
		}

		// --- Batch event fetching ---
		for (let endBlock = currentBlock; endBlock >= minBlock; endBlock -= maxBlockRange) {
			const startBlock = Math.max(minBlock, endBlock - maxBlockRange + 1)
			console.log(`[Accumulator] \u{1F4E6} Checking blocks ${startBlock} to ${endBlock} for LeafInsert events...`)
			// Get the LeafInsert event logs
			const logs: NormalizedLeafInsertEvent[] = await getLeafInsertLogs(
				this.ethereumHttpRpcUrl,
				this.contractAddress,
				startBlock,
				endBlock,
			)

			if (logs.length > 0) console.log(`[Accumulator] \u{1F343} Found ${logs.length} LeafInsert events`)

			// Process the LeafInsert event logs
			for (const event of logs.sort((a, b) => b.leafIndex - a.leafIndex)) {
				if (event.leafIndex !== --oldestProcessedLeafIndex)
					throw new Error(
						`[Accumulator] Expected leafIndex ${oldestProcessedLeafIndex} but got leafIndex ${event.leafIndex}`,
					)
				// Compute previous root CID and peaks
				const { previousRootCID, previousPeaksWithHeights } = await computePreviousRootCIDAndPeaksWithHeights(
					currentPeaksWithHeights,
					event.newData,
					event.leftInputs,
				)
				// Store the relevat data in the DB
				await this.#putLeafRecordInDB(event.leafIndex, {
					newData: event.newData,
					event,
					blockNumber: event.blockNumber,
					rootCid: previousRootCID,
					peaksWithHeights: previousPeaksWithHeights,
				})
				// Update for next iteration
				currentPeaksWithHeights = previousPeaksWithHeights
				oldestRootCid = previousRootCID
			}

			// After processing all events in this batch, fire off an IPFS check for the oldestRootCid
			const controller = new AbortController()
			const tracked = makeTrackedPromise(
				this.getAndResolveCID(oldestRootCid, { signal: controller.signal }).catch((err) => {
					if (err?.name === "AbortError") return false
					throw err
				}),
			)
			ipfsChecks.push({ ...tracked, controller, cid: oldestRootCid })
			// After each batch, poll for any truthy-resolved IPFS check
			const successfulIndex = ipfsChecks.findIndex((c) => c.isFulfilled() && c.getValue())
			if (successfulIndex !== -1) {
				// Abort all outstanding checks
				ipfsChecks.forEach((c) => c.controller.abort())
				const foundIpfsCid = ipfsChecks[successfulIndex].cid
				// Sanity check to make sure we didn't unexpectedly miss any datda
				const missing = await this.getLeafIndexesWithMissingNewData(currentLeafIndex)
				if (missing.length !== 0)
					throw new Error("Unexpectedly missing newData for leaf indices: " + missing.join(", "))
				console.log(
					`[Accumulator] \u{1F4E5} Downloaded all data for root CID ${foundIpfsCid?.toString() ?? "undefined"} from IPFS.`,
				)
				console.log(`[Accumulator] \u{1F64C} Successfully resolved all remaining data from IPFS!`)
				console.log(`[Accumulator] \u{2705} Your accumulator client is synced!`)
				await this.storage.persist()
				return
			}
			// We can also stop syncing backwards if we get back to a leaf that we laready have
			if (oldestProcessedLeafIndex <= highestLeafIndexInDB) break
		}
		// If we get here, we've fully synced backwards using only event data (no data found on IPFS)
		// Abort all outstanding IPFS checks
		ipfsChecks.forEach((c) => c.controller.abort())
		// Wait for all outstanding IPFS check promises to settle (resolve or reject)
		await Promise.allSettled(ipfsChecks.map((c) => c.promise))
		// Sanity check to make sure we didn't unexpectedly miss any datda
		const missing = await this.getLeafIndexesWithMissingNewData(currentLeafIndex)
		if (missing.length !== 0) {
			throw new Error("[Accumulator] Missing newData for leaf indices: " + missing.join(", "))
		}
		console.log(
			"[Accumulator] \u{1F9BE} Fully synced backwards using only event data and local DB data (no data used from IPFS)",
		)
		console.log(`[Accumulator] \u{2705} Your accumulator client is synced!`)
		await this.storage.persist()
	}

	/**
	 * Rebuilds the Merkle Mountain Range (MMR) by committing all uncommitted leaves and pinning the full trail to IPFS.
	 *
	 * This function iterates through all uncommitted leaves and commits them one by one.
	 * For each leaf, it adds the leaf to the MMR, stores the trail in the DB, and pins the full trail to IPFS.
	 *
	 * @returns A Promise that resolves when the MMR has been rebuilt from all uncommitted leaves.
	 */
	async rebuildAndProvideMMR(): Promise<void> {
		console.log(`[Accumulator] ⛰️ Rebuilding the Merkle Mountain Range from synced leaves and pinning to IPFS...`)
		const fromIndex: number = this.highestCommittedLeafIndex + 1
		const toIndex: number = await this.getHighestContiguousLeafIndexWithData()
		if (fromIndex > toIndex)
			throw new Error(
				`[Accumulator] Expected to commit leaves from ${fromIndex} to ${toIndex}, but found no newData for leaf ${fromIndex}`,
			)
		if (fromIndex === toIndex) return // All leaves already committed
		for (let i = fromIndex; i <= toIndex; i++) {
			const record = await this.getLeafRecord(i)
			if (!record || !record.newData) throw new Error(`[Accumulator] Expected newData for leaf ${i}`)
			if (!(record.newData instanceof Uint8Array))
				throw new Error(`[Accumulator] newData for leaf ${i} is not a Uint8Array`)
			await this.#commitLeaf(i, record.newData)
		}
		console.log(`[Accumulator] \u{2705} Fully rebuilt the Merkle Mountain Range up to leaf index ${toIndex}`)
		await this.storage.persist()
	}

	/**
	 * Gracefully shuts down the AccumulatorClient: stops live sync and closes the DB if possible.
	 * Safe to call multiple times.
	 */
	public async shutdown(): Promise<void> {
		console.log("[Accumulator] 👋 Shutting down gracefully.")
		// Stop live sync (polling or WS)
		this.stopLiveSync()
		// Close DB if possible
		await this.storage.close()
		console.log("[Accumulator] 🏁 Done.")
	}

	// ================================================
	// 				REAL-TIME EVENT MONITORING
	// Logic for watching the blockchain for new events
	// and keeping the accumulator node up-to-date.
	// ================================================

	/**
	 * Listens for new events and keeps the node up-to-date in real time.
	 * Automatically uses polling if subscriptions are not supported or no WS URL is provided.
	 */
	async startLiveSync(pollIntervalMs = 10_000): Promise<void> {
		if (this._liveSyncRunning) return
		this._liveSyncRunning = true

		let useSubscription = false
		if (this.ethereumWsRpcUrl) {
			console.log(`[Accumulator] \u{2705} Detected ETHEREUM_WS_RPC_URL: ${this.ethereumWsRpcUrl}`)
			useSubscription = await this.#detectSubscriptionSupport(this.ethereumWsRpcUrl)
			if (!useSubscription) {
				console.log("[Accumulator] \u{274C} WS endpoint does not support eth_subscribe, falling back to polling.")
			}
		} else {
			console.log("[Accumulator] 👎 No ETHEREUM_WS_RPC_URL provided, will use polling.")
		}
		console.log(
			`[Accumulator] \u{1F440} Using ${useSubscription ? "websocket subscription" : "HTTP polling"} to monitor the chain for new data insertions.`,
		)
		if (useSubscription) {
			this.#startSubscriptionSync()
		} else {
			this.#startPollingSync(pollIntervalMs)
		}
	}

	// Stops live synchronization and cleans up resources.
	stopLiveSync() {
		this._liveSyncRunning = false
		if (this._liveSyncInterval) {
			clearTimeout(this._liveSyncInterval)
			this._liveSyncInterval = undefined
		}
		if (this._ws) {
			this._ws.close()
			this._ws = undefined
		}
	}

	/**
	 * Attempts to detect if the given wsUrl supports Ethereum subscriptions (eth_subscribe).
	 * Returns true if successful, false otherwise.
	 */
	async #detectSubscriptionSupport(wsUrl: string): Promise<boolean> {
		if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
			console.log(`[Accumulator] 👎 ETHEREUM_WS_RPC_URL is not a ws:// or wss:// URL: ${wsUrl}`)
			return false
		}
		console.log(`[Accumulator] 🙏 Attempting to open WebSocket and send eth_subscribe to ${wsUrl}...`)
		return await new Promise<boolean>((resolve) => {
			let ws: WebSocket | null = null
			let finished = false
			const timeout = setTimeout(() => {
				if (!finished) {
					finished = true
					if (ws) ws.close()
					resolve(false)
				}
			}, 3000)

			try {
				ws = new WebSocket(wsUrl)
				ws.onopen = () => {
					// Send a test eth_subscribe request
					const msg = JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "eth_subscribe",
						params: ["newHeads"],
					})
					ws!.send(msg)
				}
				ws.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data)
						if (data.id === 1 && (data.result || data.error)) {
							if (!finished) {
								finished = true
								clearTimeout(timeout)
								ws!.close()
								resolve(!data.error)
							}
						}
					} catch {
						/* ignore parse errors */
					}
				}
				ws.onerror = () => {
					if (!finished) {
						finished = true
						clearTimeout(timeout)
						ws!.close()
						resolve(false)
					}
				}
				ws.onclose = () => {
					if (!finished) {
						finished = true
						clearTimeout(timeout)
						resolve(false)
					}
				}
			} catch {
				if (!finished) {
					finished = true
					clearTimeout(timeout)
					if (ws) ws.close()
					resolve(false)
				}
			}
		})
	}

	#startPollingSync(pollIntervalMs: number) {
		const poll = async () => {
			try {
				const { meta } = await getAccumulatorData(this.ethereumHttpRpcUrl, this.contractAddress)
				const latestBlock = meta.previousInsertBlockNumber
				if (latestBlock > this._lastProcessedBlock) {
					const newEvents = await getLeafInsertLogs(
						this.ethereumHttpRpcUrl,
						this.contractAddress,
						this._lastProcessedBlock + 1,
						latestBlock,
					)
					for (const event of newEvents) {
						await this.#processNewLeafEvent(event)
					}
					this._lastProcessedBlock = latestBlock
				}
			} catch (err) {
				console.error("[LiveSync] Error during polling:", err)
			}
			if (this._liveSyncRunning) {
				this._liveSyncInterval = setTimeout(poll, pollIntervalMs)
			}
		}
		poll()
	}

	#startSubscriptionSync() {
		if (!this.ethereumWsRpcUrl) {
			console.error("[Accumulator] No ETHEREUM_WS_RPC_URL set. Cannot start subscription sync.")
			return
		}
		if (this._ws) {
			console.warn("[Accumulator] Subscription WebSocket already running.")
			return
		}
		console.log(`[Accumulator] Connecting to WS: ${this.ethereumWsRpcUrl}`)
		this._ws = new WebSocket(this.ethereumWsRpcUrl)
		this._ws.onopen = () => {
			console.log("[Accumulator] WebSocket open. Subscribing to newHeads...")
			const msg = JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "eth_subscribe",
				params: ["newHeads"],
			})
			this._ws!.send(msg)
		}
		let subscriptionId: string | null = null
		this._ws.onmessage = async (event) => {
			try {
				const data = JSON.parse(event.data)
				if (data.id === 1 && data.result) {
					subscriptionId = data.result
					console.log(`[Accumulator] Subscribed to newHeads. Subscription id: ${subscriptionId}`)
					return
				}
				// Handle new block notifications
				if (data.method === "eth_subscription" && data.params && data.params.subscription === subscriptionId) {
					const blockHash = data.params.result.hash
					console.log(`[Accumulator] New block: ${blockHash}. Fetching events...`)
					// Get latest block number and process new events
					try {
						const { meta } = await getAccumulatorData(this.ethereumHttpRpcUrl, this.contractAddress)
						const latestBlock = meta.previousInsertBlockNumber
						if (latestBlock > this._lastProcessedBlock) {
							const newEvents = await getLeafInsertLogs(
								this.ethereumHttpRpcUrl,
								this.contractAddress,
								this._lastProcessedBlock + 1,
								latestBlock,
							)
							for (const event of newEvents) {
								await this.#processNewLeafEvent(event)
							}
							this._lastProcessedBlock = latestBlock
						}
					} catch (err) {
						console.error("[LiveSync] Error during WS event processing:", err)
					}
				}
			} catch (err) {
				console.error("[Accumulator] Error parsing WS message:", err)
			}
		}
		this._ws.onerror = (err) => {
			console.error("[Accumulator] WebSocket error:", err)
		}
		this._ws.onclose = () => {
			console.log("[Accumulator] WebSocket closed.")
			this._ws = undefined
		}
	}

	// Processes a new leaf event and commits it to the MMR.
	async #processNewLeafEvent(event: NormalizedLeafInsertEvent): Promise<void> {
		// return if we have already processed this leaf
		if (event.leafIndex <= this.highestCommittedLeafIndex) return

		// if event.leafIndex > highestCommittedLeafIndex + 1:
		if (event.leafIndex > this.highestCommittedLeafIndex + 1) {
			console.log(
				`[Accumulator] \u{1F4CC} Missing event for leaf indexes ${this.highestCommittedLeafIndex + 1} to ${event.leafIndex - 1}. Getting them now...`,
			)
			// Walk back through the previousInsertBlockNumber's to get the missing leaves
			const pastEvents: NormalizedLeafInsertEvent[] = await walkBackLeafInsertLogsOrThrow(
				this.ethereumHttpRpcUrl,
				this.contractAddress,
				event.leafIndex - 1,
				event.previousInsertBlockNumber,
				this.highestCommittedLeafIndex + 1,
			)
			for (let i = 0; i < pastEvents.length; i++) {
				await this.#processNewLeafEvent(pastEvents[i])
			}
			console.log(`[Accumulator] \u{1F44D} Got the missing events.`)
		}

		// Store the event in the DB
		await this.#putLeafRecordInDB(event.leafIndex, getLeafRecordFromNormalizedLeafInsertEvent(event))

		// Commit the leaf to the MMR
		await this.#commitLeaf(event.leafIndex, event.newData)

		// === THE FOLLOWING CODE BLOCK CAN BE REMOVED. IT IS JUST A SANITY CHECK. ===
		const { meta } = await getAccumulatorData(this.ethereumHttpRpcUrl, this.contractAddress)
		// This sanity check only makes sense when the node is fully synced
		if (this.highestCommittedLeafIndex === meta.leafCount - 1) {
			try {
				const localRootCid = await this.mmr.rootCIDAsBase32()
				const onChainRootCid = await getLatestCID(this.ethereumHttpRpcUrl, this.contractAddress)
				if (localRootCid !== onChainRootCid.toString()) {
					console.warn(
						`[Accumulator:SanityCheck] \u{274C} Local (${localRootCid} )and on-chain (${onChainRootCid.toString()}) root CIDs do NOT match!`,
					)
				} else {
					console.log("[Accumulator:SanityCheck] \u{2705} Local and on-chain root CIDs match!")
				}
			} catch (err) {
				console.warn("[Accumulator:SanityCheck] \u{274C} Failed to compare root CIDs:", err)
			}
		}
		// =============================== END SANITY CHECK. ===============================

		console.log(`[Accumulator] \u{1F343} Processed new leaf with index ${event.leafIndex}`)
	}

	// Adds a leaf to the MMR, stores the trail in the DB, and pins the full trail to IPFS (if applicable).
	async #commitLeaf(leafIndex: number, newData: Uint8Array): Promise<void> {
		// Add leaf to MMR
		const trail = await this.mmr.addLeafWithTrail(leafIndex, newData)
		// Store trail in local DB (efficient append-only)
		await this.#appendTrailToDB(trail)
		// Pin and provide trail to IPFS
		if (this.shouldPut) {
			for (const { cid, dagCborEncodedData } of trail) {
				await this.#putPinProvideToIPFS(cid, dagCborEncodedData)
			}
		}

		this.highestCommittedLeafIndex++
	}

	// ====================================================
	//        				IPFS OPERATIONS
	// Utilities for interacting with IPFS: putting,
	// pinning, providing and retreiving CIDs and blocks.
	// ====================================================

	/**
	 * Recursively attempts to resolve the entire DAG from a given root CID using the IPFS adapter.
	 * If it succeeds, adds all the leaf data to the database.
	 * Can optionally reject on abort signal to allow for cancellation.
	 *
	 * @param cid - The root CID to resolve.
	 * @returns true if all leaf data are available, false otherwise.
	 */
	async getAndResolveCID(cid: CID<unknown, 113, 18, 1>, opts?: { signal?: AbortSignal }): Promise<boolean> {
		const signal = opts?.signal
		// Only throw if already aborted at entry
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
		let abortListener: (() => void) | undefined
		let abortPromise: Promise<never> | undefined
		if (signal) {
			abortPromise = new Promise((_, reject) => {
				abortListener = () => reject(new DOMException("Aborted", "AbortError"))
				signal.addEventListener("abort", abortListener)
			})
		}
		try {
			const leavesPromise = resolveMerkleTreeOrThrow(cid, this.ipfs)
			const leaves = await (abortPromise ? Promise.race([leavesPromise, abortPromise]) : leavesPromise)
			for (let i = 0; i < leaves.length; i++)
				await this.#putLeafRecordInDB(i, { newData: leaves[i], __type: "LeafRecord" })
			return true
		} catch {
			// Always return false on any error (including AbortError)
			return false
		} finally {
			if (signal && abortListener) signal.removeEventListener("abort", abortListener)
		}
	}

	/**
	 * Re-pins all CIDs and related data to IPFS.
	 * Data is automatically pinned during rebuildAndProvideMMR and processNewLeafEvent,
	 * so this function does not need to be called during normal use.
	 * This is just a helper in case your IPFS node has lost data and you want to make sure it is
	 * pinning all the data you have synced.
	 * @returns A Promise that resolves when all data has been pinned to IPFS.
	 */
	rePinAllDataToIPFS(): void {
		if (!this.shouldPin) {
			console.log(`[Accumulator] ℹ️ rePinAllDataToIPFS skipped because this.shouldPin == false`)
			return
		}
		this.storage.get("dag:trail:maxIndex").then((result) => {
			const toIndex = Number(result ?? -1)
			if (toIndex === -1) return // Launch the pinning process in the background
			;(async () => {
				console.log(
					`[Accumulator] \u{1F4CC} Attempting to pin all ${toIndex + 1} CIDs (leaves, root, and intermediate nodes) to IPFS. Running in background. Will update you...`,
				)
				let count = 0
				let failed = 0
				for (let i = 0; i <= toIndex; i++) {
					try {
						const pair: CIDDataPair | null = await this.getCIDDataPairFromDB(i)
						if (!pair) throw new Error(`[Accumulator] Expected CIDDataPair for leaf ${i}`)

						const putOk = await this.#putPinProvideToIPFS(pair.cid, pair.dagCborEncodedData)
						if (!putOk) {
							failed++
							continue
						}
						count++
						if (count % 100 === 0) {
							console.log(`[Accumulator] \u{1F4CC} UPDATE: Re-pinned ${count} CIDs to IPFS so far. Still working...`)
						}
					} catch (err) {
						console.error(`[Accumulator] Error during optimistic IPFS pinning:`, err)
					}
				}
				console.log(`[Accumulator] \u{2705} Pinned ${count} CIDs to IPFS (${failed} failures). Done!`)
			})()
		})
	}

	// Helper for robust IPFS put/pin/provide with logging
	async #putPinProvideToIPFS(cid: CID<unknown, 113, 18, 1>, dagCborEncodedData: DagCborEncodedData): Promise<boolean> {
		await verifyCIDAgainstDagCborEncodedDataOrThrow(dagCborEncodedData, cid)
		if (this.shouldPut) {
			try {
				await this.ipfs.putBlock(cid, dagCborEncodedData)
			} catch (err) {
				console.error(`[Accumulator] \u{1F4A5} IPFS put failed for CID ${cid}:`, err)
				return false
			}
		}
		if (this.shouldProvide) {
			try {
				await this.ipfs.provide(cid)
			} catch (err) {
				console.error(`[Accumulator] IPFS provide failed for CID ${cid}:`, err)
			}
		}
		return true
	}

	// ====================================================
	//        DATABASE OPERATIONS & DATA MANAGEMENT
	// Functions for storing, retrieving, and managing
	// accumulator data in the configured storage backend.
	// ====================================================

	// Store a leaf record in the DB by leafIndex, splitting fields into separate keys.
	async #putLeafRecordInDB(leafIndex: number, value: LeafRecord): Promise<void> {
		// Store newData
		await this.storage.put(`leaf:${leafIndex}:newData`, uint8ArrayToHexString(value.newData))
		// Store optional fields as strings
		if (value.event !== undefined)
			await this.storage.put(`leaf:${leafIndex}:event`, normalizedLeafInsertEventToString(value.event))
		if (value.blockNumber !== undefined)
			await this.storage.put(`leaf:${leafIndex}:blockNumber`, value.blockNumber.toString())
		if (value.rootCid !== undefined) await this.storage.put(`leaf:${leafIndex}:rootCid`, value.rootCid.toString())
		if (value.peaksWithHeights !== undefined)
			await this.storage.put(
				`leaf:${leafIndex}:peaksWithHeights`,
				peakWithHeightArrayToStringForDB(value.peaksWithHeights),
			)
	}

	// Retrieve a leaf record by leafIndex, reconstructing from individual fields. Throws if types are not correct. */
	async getLeafRecord(leafIndex: number): Promise<LeafRecord | undefined> {
		const newDataStr = await this.storage.get(`leaf:${leafIndex}:newData`)
		if (!newDataStr) return undefined
		const newData = hexStringToUint8Array(newDataStr)
		const eventStr = await this.storage.get(`leaf:${leafIndex}:event`)
		const event = eventStr !== undefined ? stringToNormalizedLeafInsertEvent(eventStr) : undefined
		const blockNumberStr = await this.storage.get(`leaf:${leafIndex}:blockNumber`)
		const blockNumber = blockNumberStr !== undefined ? parseInt(blockNumberStr, 10) : undefined
		const rootCidStr = await this.storage.get(`leaf:${leafIndex}:rootCid`)
		const rootCid = rootCidStr !== undefined ? CID.parse(rootCidStr) : undefined
		const peaksWithHeightsStr = await this.storage.get(`leaf:${leafIndex}:peaksWithHeights`)
		const peaksWithHeights =
			peaksWithHeightsStr !== undefined ? await stringToPeakWithHeightArray(peaksWithHeightsStr) : undefined

		return {
			newData,
			event,
			blockNumber,
			rootCid,
			peaksWithHeights,
		}
	}

	/**
	 * Searches from leafIndex 0 to maxLeafIndex for leaves that are missing newData.
	 * Returns an array of leaf indexes that are missing newData.
	 * Used for sanity checking.
	 */
	async getLeafIndexesWithMissingNewData(maxLeafIndex: number): Promise<number[]> {
		const missing: number[] = []
		for (let i = 0; i <= maxLeafIndex; i++) {
			const rec = await this.getLeafRecord(i)
			if (!rec || !rec.newData) missing.push(i)
		}
		return missing
	}

	/**
	 * Appends all trail pairs to the DB in an efficient, sequential manner.
	 * Each pair is stored as dag:trail:<index>. The max index is tracked by dag:trail:maxIndex.
	 * Does not store a CID/Data pair if it is already in the DB
	 */
	async #appendTrailToDB(trail: MMRLeafInsertTrail): Promise<void> {
		let maxIndex = Number((await this.storage.get("dag:trail:maxIndex")) ?? -1)
		for (const pair of trail) {
			await verifyCIDAgainstDagCborEncodedDataOrThrow(pair.dagCborEncodedData, pair.cid)
			const cidStr = pair.cid.toString()
			const seenKey = `cid:${cidStr}`
			const alreadyStored = await this.storage.get(seenKey)
			if (alreadyStored) continue

			maxIndex++
			await this.storage.put(`dag:trail:index:${maxIndex}`, cidDataPairToStringForDB(pair))
			await this.storage.put(seenKey, "1")
		}
		await this.storage.put("dag:trail:maxIndex", maxIndex.toString())
	}

	async getCIDDataPairFromDB(index: number): Promise<CIDDataPair | null> {
		const value = await this.storage.get(`dag:trail:index:${index}`)
		if (value && typeof value === "string") {
			const cidDataPair: CIDDataPair = await stringFromDBToCIDDataPair(value)
			// sanity check
			await verifyCIDAgainstDagCborEncodedDataOrThrow(cidDataPair.dagCborEncodedData, cidDataPair.cid)
			return cidDataPair
		}
		return null
	}

	// Async generator to efficiently iterate over all stored trail pairs.
	async *iterateTrailPairs(): AsyncGenerator<CIDDataPair> {
		for await (const { value } of this.storage.iterate("dag:trail:index:")) {
			if (value && typeof value === "string") yield stringFromDBToCIDDataPair(value)
		}
	}

	// Finds the highest contiguous leaf index N such that all leaf records 0...N have newData.
	async getHighestContiguousLeafIndexWithData(): Promise<number> {
		let i = 0
		while (true) {
			const record = await this.getLeafRecord(i)
			if (!record || !record.newData) {
				return i - 1
			}
			i++
		}
	}
}
