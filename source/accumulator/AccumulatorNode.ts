import type { IpfsAdapter } from "../interfaces/IpfsAdapter.ts"
import type { StorageAdapter } from "../interfaces/StorageAdapter.ts"
import type { CID } from "multiformats/cid"
import { getAccumulatorData } from "../ethereum/commonCalls.ts"
import type {
	PeakWithHeight,
	LeafRecord,
	NormalizedLeafInsertEvent,
	MMRLeafInsertTrail,
	CIDDataPair,
} from "../types/types.ts"
import { resolveMerkleTreeOrThrow } from "../ipfs/ipfs.ts"
import { computePreviousRootCIDAndPeaksWithHeights } from "./mmrUtils.ts"
import { getRootCIDFromPeaks } from "./mmrUtils.ts"
import { getLeafInsertLogs, getLatestCID } from "../ethereum/commonCalls.ts"

import { MerkleMountainRange } from "./MerkleMountainRange.ts"
import {
	CIDDataPairToString,
	CIDTohexString,
	Uint8ArrayToHexString,
	NormalizedLeafInsertEventToString,
	PeakWithHeightArrayToString,
	HexStringToUint8Array,
	StringToNormalizedLeafInsertEvent,
	hexStringToCID,
	StringToPeakWithHeightArray,
	stringToCIDDataPair,
	getLeafRecordFromNormalizedLeafInsertEvent,
} from "../utils/codec.ts"
import { walkBackLeafInsertLogsOrThrow } from "../utils/walkBackLogsOrThrow.ts"

/**
 * AccumulatorNode: Unified entry point for accumulator logic in any environment.
 * Pass in the appropriate IpfsAdapter and StorageAdapter for your environment.
 */
export class AccumulatorNode {
	ipfs: IpfsAdapter
	storage: StorageAdapter
	ethereumHttpRpcUrl: string
	ethereumWsRpcUrl?: string
	contractAddress: string
	mmr: MerkleMountainRange
	highestCommittedLeafIndex: number

	private _liveSyncRunning: boolean = false
	private _liveSyncInterval?: ReturnType<typeof setTimeout>
	private _lastProcessedBlock: number = 0
	private _ws?: WebSocket

	constructor({
		ipfs,
		storage,
		ethereumHttpRpcUrl,
		ethereumWsRpcUrl,
		contractAddress,
	}: {
		ipfs: IpfsAdapter
		storage: StorageAdapter
		ethereumHttpRpcUrl: string
		ethereumWsRpcUrl?: string
		contractAddress: string
		[key: string]: any // TODO come back to this and see what's up with it
	}) {
		this.ipfs = ipfs
		this.storage = storage
		this.ethereumHttpRpcUrl = ethereumHttpRpcUrl
		this.ethereumWsRpcUrl = ethereumWsRpcUrl
		this.contractAddress = contractAddress
		this.mmr = new MerkleMountainRange()
		this.highestCommittedLeafIndex = -1
	}

	/**
	 * Listens for new events and keeps the node up-to-date in real time.
	 * Automatically uses polling if subscriptions are not supported or no WS URL is provided.
	 */
	async startLiveSync(pollIntervalMs = 10_000): Promise<void> {
		if (this._liveSyncRunning) return
		this._liveSyncRunning = true

		let useSubscription = false
		if (this.ethereumWsRpcUrl) {
			console.log(`[Accumulator] Detected ETHEREUM_WS_RPC_URL: ${this.ethereumWsRpcUrl}`)
			useSubscription = await this.#detectSubscriptionSupport(this.ethereumWsRpcUrl)
			if (!useSubscription) {
				console.log("[Accumulator] WS endpoint does not support eth_subscribe, falling back to polling.")
			}
		} else {
			console.log("[Accumulator] No ETHEREUM_WS_RPC_URL provided, will use polling.")
		}

		if (useSubscription) {
			console.log("[Accumulator] Using Ethereum WS subscriptions for live sync.")
			this.#startSubscriptionSync()
		} else {
			console.log("[Accumulator] Using polling for live sync.")
			this.#startPollingSync(pollIntervalMs)
		}
	}

	/**
	 * Attempts to detect if the given wsUrl supports Ethereum subscriptions (eth_subscribe).
	 * Returns true if successful, false otherwise.
	 */
	async #detectSubscriptionSupport(wsUrl: string): Promise<boolean> {
		if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
			console.log(`[Accumulator] ETHEREUM_WS_RPC_URL is not a ws:// or wss:// URL: ${wsUrl}`)
			return false
		}
		console.log(`[Accumulator] Attempting to open WebSocket and send eth_subscribe to ${wsUrl}...`)
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
	 * Processes a new leaf event and commits it to the MMR.
	 */
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
		await this.commitLeaf(event.leafIndex, event.newData)

		// TEST/DEBUG: Check to see if our mmr root CID matches the on-chain root CID
		try {
			const localRootCid = await this.mmr.rootCIDAsBase32()
			const onChainRootCid = await getLatestCID(this.ethereumHttpRpcUrl, this.contractAddress)
			console.log(`[Accumulator DEBUG] Local MMR root CID (base32): ${localRootCid}`)
			console.log(`[Accumulator DEBUG] On-chain latest root CID: ${onChainRootCid}`)
			if (localRootCid !== onChainRootCid.toString()) {
				console.warn("[Accumulator DEBUG] Local and on-chain root CIDs do NOT match!")
			} else {
				console.log("[Accumulator DEBUG] Local and on-chain root CIDs match!")
			}
		} catch (err) {
			console.warn("[Accumulator DEBUG] Failed to compare root CIDs:", err)
		}
		console.log(`[Accumulator] Processed new leaf with index ${event.leafIndex}`)
	}

	/**
	 * Commits all uncommitted leaves to the MMR and pins the full trail to IPFS.
	 *
	 * This function iterates through all uncommitted leaves and commits them one by one.
	 * For each leaf, it adds the leaf to the MMR, stores the trail in the DB, and pins the full trail to IPFS.
	 *
	 * @returns A Promise that resolves when all uncommitted leaves have been committed.
	 */
	async commitAllUncommittedLeaves(): Promise<void> {
		console.log(`[Accumulator] \u{1F4DC} Committing all uncommitted leaves...`)
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
			await this.commitLeaf(i, record.newData)
		}
		console.log(`[Accumulator] \u{2705} Committed all uncommitted leaves from ${fromIndex} to ${toIndex}`)
	}

	/**
	 * Adds a leaf to the MMR, stores the trail in the DB, and pins the full trail to IPFS.
	 *
	 * @param leafIndex - The index of the leaf to add.
	 * @param newData - The new data for the leaf.
	 */
	async commitLeaf(leafIndex: number, newData: Uint8Array): Promise<void> {
		// Add leaf to MMR
		const trail = await this.mmr.addLeafWithTrail(leafIndex, newData)
		// Store trail in local DB (efficient append-only)
		await this.appendTrailToDB(trail)
		// Pin and provide trail to IPFS
		for (const { cid, data } of trail) {
			await this.ipfs.put(cid, data)
			await this.ipfs.pin(cid)
			await this.ipfs.provide(cid)
		}
		this.highestCommittedLeafIndex++
	}

	/**
	 * Re-pins all data to IPFS.
	 *
	 * This function iterates through all trail pairs and re-pins each CID to IPFS.
	 * It provides a progress update every 100 CIDs.
	 */
	async rePinAllDataToIPFS(): Promise<void> {
		const toIndex = Number((await this.storage.get("dag:trail:maxIndex")) ?? -1)
		if (toIndex === -1) return
		console.log(`[Accumulator] \u{1F4CC} Re-pinning all ${toIndex + 1} CIDs to IPFS...`)

		let count = 0
		for (let i = 0; i <= toIndex; i++) {
			const pair: CIDDataPair | null = await this.getCIDDataPairFromDB(i)
			if (!pair) throw new Error(`[Accumulator] Expected CIDDataPair for leaf ${i}`)

			await this.ipfs.put(pair.cid, pair.data)
			await this.ipfs.pin(pair.cid)
			await this.ipfs.provide(pair.cid)
			count++
			if (count % 100 === 0) {
				console.log(`[Accumulator] \u{1F4CC} Re-pinned ${count} CIDs to IPFS...`)
			}
		}
		console.log(`[Accumulator] \u{2705} Re-pinned all ${count} CIDs to IPFS. Done!`)
	}

	//Store a leaf record in the DB by leafIndex, splitting fields into separate keys.
	async #putLeafRecordInDB(leafIndex: number, value: LeafRecord): Promise<void> {
		// Store newData
		await this.storage.put(`leaf:${leafIndex}:newData`, Uint8ArrayToHexString(value.newData))
		// Store optional fields as strings
		if (value.event !== undefined)
			await this.storage.put(`leaf:${leafIndex}:event`, NormalizedLeafInsertEventToString(value.event))
		if (value.blockNumber !== undefined)
			await this.storage.put(`leaf:${leafIndex}:blockNumber`, value.blockNumber.toString())
		if (value.rootCid !== undefined) await this.storage.put(`leaf:${leafIndex}:rootCid`, CIDTohexString(value.rootCid))
		if (value.peaksWithHeights !== undefined)
			await this.storage.put(`leaf:${leafIndex}:peaksWithHeights`, PeakWithHeightArrayToString(value.peaksWithHeights))
	}

	/** Retrieve a leaf record by leafIndex, reconstructing from individual fields. Throws if types are not correct. */
	async getLeafRecord(leafIndex: number): Promise<LeafRecord | undefined> {
		const newDataStr = await this.storage.get(`leaf:${leafIndex}:newData`)
		if (!newDataStr) return undefined
		const newData = HexStringToUint8Array(newDataStr)
		const eventStr = await this.storage.get(`leaf:${leafIndex}:event`)
		const event = eventStr !== undefined ? StringToNormalizedLeafInsertEvent(eventStr) : undefined
		const blockNumberStr = await this.storage.get(`leaf:${leafIndex}:blockNumber`)
		const blockNumber = blockNumberStr !== undefined ? parseInt(blockNumberStr, 10) : undefined
		const rootCidStr = await this.storage.get(`leaf:${leafIndex}:rootCid`)
		const rootCid = rootCidStr !== undefined ? await hexStringToCID(rootCidStr) : undefined
		const peaksWithHeightsStr = await this.storage.get(`leaf:${leafIndex}:peaksWithHeights`)
		const peaksWithHeights =
			peaksWithHeightsStr !== undefined ? await StringToPeakWithHeightArray(peaksWithHeightsStr) : undefined

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
	 * Syncs backwards from the latest leaf/block, fetching events and storing by leafIndex.
	 * Uses on-chain metadata to determine where to start.
	 */
	async syncBackwardsFromLatest(maxBlockRange = 1000): Promise<void> {
		const { meta, peaks } = await getAccumulatorData(this.ethereumHttpRpcUrl, this.contractAddress)
		const currentLeafIndex = meta.leafCount - 1
		const currentBlock = meta.previousInsertBlockNumber
		const minBlock = meta.deployBlockNumber
		this._lastProcessedBlock = meta.previousInsertBlockNumber

		console.log(
			`[Accumulator] \u{1F501} Syncing backwards from block ${meta.previousInsertBlockNumber} to block ${meta.deployBlockNumber} (${meta.previousInsertBlockNumber - meta.deployBlockNumber} blocks), grabbing ${maxBlockRange} blocks per RPC call.`,
		)
		console.log(`[Accumulator] \u{1F50E} Simultaneously checking IPFS for older root CIDs as we discover them.`)

		// Compute the current root CID from the current peaks
		const currentRootCID = await getRootCIDFromPeaks(peaks.map((p) => p.cid))

		let oldestRootCid: CID = currentRootCID
		let oldestProcessedLeafIndex = currentLeafIndex + 1
		let currentPeaksWithHeights: PeakWithHeight[] = peaks

		const ipfsChecks: Array<
			ReturnType<typeof makeTrackedPromise<boolean>> & { controller: AbortController; cid: CID }
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
					`[Accumulator] \u{1F4E5} Downloaded all data for root CID ${foundIpfsCid?.toString() ?? "undefined"}.`,
				)
				console.log(`[Accumulator] \u{1F64C} Successfully resolved all remaining data from IPFS!`)
				console.log(`[Accumulator] \u{2705} Your accumulator node is synced!`)
				return
			}
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
		console.log("[Accumulator] \u{1F9BE} Fully synced backwards using only event data (no data found on IPFS)")
		console.log(`[Accumulator] \u{2705} Your accumulator node is synced!`)
	}

	/**
	 * Recursively attempts to resolve the entire DAG from a given root CID using the IPFS adapter.
	 * If it succeeds, adds all the leaf data to the database.
	 * Can optionally reject on abort signal to allow for cancellation.
	 *
	 * @param cid - The root CID to resolve.
	 * @returns true if all leaf data are available, false otherwise.
	 */
	// Accept an optional AbortSignal and respect it
	async getAndResolveCID(cid: CID, opts?: { signal?: AbortSignal }): Promise<boolean> {
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

	// --- Helpers ---

	/**
	 * Appends all trail pairs to the DB in an efficient, sequential manner.
	 * Each pair is stored as dag:trail:<index>. The max index is tracked by dag:trail:maxIndex.
	 * Does not store a CID/Data pair if it is already in the DB
	 */
	async appendTrailToDB(trail: MMRLeafInsertTrail): Promise<void> {
		let maxIndex = Number((await this.storage.get("dag:trail:maxIndex")) ?? -1)
		for (const pair of trail) {
			const cidStr = pair.cid.toString()
			const seenKey = `cid:${cidStr}`
			const alreadyStored = await this.storage.get(seenKey)
			if (alreadyStored) continue

			maxIndex++
			await this.storage.put(`dag:trail:index:${maxIndex}`, CIDDataPairToString(pair))
			await this.storage.put(seenKey, "1")
		}
		await this.storage.put("dag:trail:maxIndex", maxIndex.toString())
	}

	async getCIDDataPairFromDB(index: number): Promise<CIDDataPair | null> {
		const value = await this.storage.get(`dag:trail:index:${index}`)
		if (value && typeof value === "string") return stringToCIDDataPair(value)
		return null
	}

	/**
	 * Async generator to efficiently iterate over all stored trail pairs.
	 */
	async *iterateTrailPairs(): AsyncGenerator<CIDDataPair> {
		for await (const { value } of this.storage.iterate("dag:trail:index:")) {
			if (value && typeof value === "string") yield stringToCIDDataPair(value)
		}
	}

	/**
	 * Finds the highest contiguous leaf index N such that all leaf records 0...N have newData.
	 */
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
	/**
	 * Gracefully shuts down the AccumulatorNode: stops live sync and closes the DB if possible.
	 * Safe to call multiple times.
	 */
	public async shutdown(): Promise<void> {
		// Stop live sync (polling or WS)
		this.stopLiveSync()
		// Close DB if possible
		if (this.storage && typeof this.storage === "object" && "db" in this.storage) {
			const db = (this.storage as any).db
			if (db && typeof db.close === "function") {
				try {
					await db.close()
				} catch (e) {
					console.error("[AccumulatorNode] Error closing DB:", e)
				}
			}
		}
	}
}
