import { CID } from "../../utils/CID.ts"
import type { NormalizedLeafInsertEvent, PeakWithHeight } from "../../types/types.ts"
import { getAccumulatorData, getLeafInsertLogs, getLatestCID } from "../../ethereum/commonCalls.ts"
import {
	getHighestContiguousLeafIndexWithData,
	getLeafIndexesWithMissingNewData,
	putLeafRecordInDB,
} from "./storageHelpers.ts"
import { getAndResolveCID } from "./ipfsHelpers.ts"
import { commitLeaf } from "./mmrHelpers.ts"
import { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { walkBackLeafInsertLogsOrThrow } from "../../utils/walkBackLogsOrThrow.ts"
import { computePreviousRootCIDAndPeaksWithHeights, getRootCIDFromPeaks } from "../merkleMountainRange/mmrUtils.ts"
import { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import { getLeafRecordFromNormalizedLeafInsertEvent } from "../../utils/codec.ts"
import { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange.ts"
// ================================================
// REAL-TIME EVENT MONITORING
// Logic for watching the blockchain for new events
// and keeping the accumulator node up-to-date.
// ================================================

/**
 * Syncs backwards from the latest leaf/block, fetching events and storing by leafIndex.
 * Uses on-chain metadata to determine where to start.
 */
export async function syncBackwardsFromLatest(
	ipfs: IpfsAdapter,
	storage: StorageAdapter,
	ethereumHttpRpcUrl: string,
	contractAddress: string,
	setLastProcessedBlock: (block: number) => void,
	maxBlockRangePerRpcCall = 1000,
): Promise<void> {
	const { meta, peaks } = await getAccumulatorData(ethereumHttpRpcUrl, contractAddress)
	const currentLeafIndex = meta.leafCount - 1
	const currentBlock = meta.previousInsertBlockNumber
	const minBlock = meta.deployBlockNumber
	setLastProcessedBlock(meta.previousInsertBlockNumber)

	const highestLeafIndexInDB = await getHighestContiguousLeafIndexWithData(storage)

	console.log(
		`[Accumulator] \u{1F501} Syncing backwards from block ${meta.previousInsertBlockNumber} to block ${meta.deployBlockNumber} (${meta.previousInsertBlockNumber - meta.deployBlockNumber} blocks), grabbing ${maxBlockRangePerRpcCall} blocks per RPC call.`,
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
	for (let endBlock = currentBlock; endBlock >= minBlock; endBlock -= maxBlockRangePerRpcCall) {
		const startBlock = Math.max(minBlock, endBlock - maxBlockRangePerRpcCall + 1)
		console.log(`[Accumulator] \u{1F4E6} Checking blocks ${startBlock} to ${endBlock} for LeafInsert events...`)
		// Get the LeafInsert event logs
		const logs: NormalizedLeafInsertEvent[] = await getLeafInsertLogs(
			ethereumHttpRpcUrl,
			contractAddress,
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
			await putLeafRecordInDB(storage, event.leafIndex, {
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
			getAndResolveCID(ipfs, storage, oldestRootCid, { signal: controller.signal }).catch((err) => {
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
			const missing = await getLeafIndexesWithMissingNewData(storage, currentLeafIndex)
			if (missing.length !== 0) throw new Error("Unexpectedly missing newData for leaf indices: " + missing.join(", "))
			console.log(
				`[Accumulator] \u{1F4E5} Downloaded all data for root CID ${foundIpfsCid?.toString() ?? "undefined"} from IPFS.`,
			)
			console.log(`[Accumulator] \u{1F64C} Successfully resolved all remaining data from IPFS!`)
			console.log(`[Accumulator] \u{2705} Your accumulator client is synced!`)
			await storage.persist()
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
	const missing = await getLeafIndexesWithMissingNewData(storage, currentLeafIndex)
	if (missing.length !== 0) {
		throw new Error("[Accumulator] Missing newData for leaf indices: " + missing.join(", "))
	}
	console.log(
		"[Accumulator] \u{1F9BE} Fully synced backwards using only event data and local DB data (no data used from IPFS)",
	)
	console.log(`[Accumulator] \u{2705} Your accumulator client is synced!`)
	await storage.persist()
}

/**
 * Listens for new events and keeps the node up-to-date in real time.
 * Automatically uses polling if subscriptions are not supported or no WS URL is provided.
 */
export async function startLiveSync(
	ipfs: IpfsAdapter,
	mmr: MerkleMountainRange,
	storage: StorageAdapter,
	contractAddress: string,
	ethereumHttpRpcUrl: string,
	ethereumWsRpcUrl: string | undefined,
	ws: WebSocket | undefined,
	setWs: (newWs: WebSocket | undefined) => void,
	getLiveSyncRunning: () => boolean,
	setLiveSyncRunning: (isRUnning: boolean) => void,
	setLiveSyncInterval: (interval: ReturnType<typeof setTimeout> | undefined) => void,
	lastProcessedBlock: number,
	setLastProcessedBlock: (blockNumber: number) => void,
	getHighestCommittedLeafIndex: () => number,
	setHighestCommittedLeafIndex: (index: number) => void,
	shouldPut: boolean,
	shouldProvide: boolean,
	pollIntervalMs = 10_000,
): Promise<void> {
	if (getLiveSyncRunning()) return
	setLiveSyncRunning(true)

	let useSubscription = false
	if (ethereumWsRpcUrl) {
		console.log(`[Accumulator] \u{2705} Detected ETHEREUM_WS_RPC_URL: ${ethereumWsRpcUrl}`)
		useSubscription = await detectSubscriptionSupport(ethereumWsRpcUrl)
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
		startSubscriptionSync(
			ipfs,
			mmr,
			storage,
			ethereumHttpRpcUrl,
			ethereumWsRpcUrl,
			ws,
			setWs,
			lastProcessedBlock,
			setLastProcessedBlock,
			contractAddress,
			getHighestCommittedLeafIndex,
			setHighestCommittedLeafIndex,
			shouldPut,
			shouldProvide,
		)
	} else {
		startPollingSync(
			ipfs,
			mmr,
			storage,
			ethereumHttpRpcUrl,
			contractAddress,
			getLiveSyncRunning,
			setLiveSyncInterval,
			lastProcessedBlock,
			setLastProcessedBlock,
			getHighestCommittedLeafIndex,
			setHighestCommittedLeafIndex,
			shouldPut,
			shouldProvide,
			pollIntervalMs,
		)
	}
}

// Stops live synchronization and cleans up resources.
export function stopLiveSync(
	ws: WebSocket | undefined,
	setWs: (ws: WebSocket | undefined) => void,
	liveSyncInterval: ReturnType<typeof setTimeout> | undefined,
	setLiveSyncRunning: (isRunning: boolean) => void,
	setLiveSyncInterval: (interval: ReturnType<typeof setTimeout> | undefined) => void,
) {
	setLiveSyncRunning(false)
	if (liveSyncInterval) {
		clearTimeout(liveSyncInterval)
		setLiveSyncInterval(undefined)
	}
	if (ws) {
		ws.close()
		setWs(undefined)
	}
}

/**
 * Attempts to detect if the given wsUrl supports Ethereum subscriptions (eth_subscribe).
 * Returns true if successful, false otherwise.
 */
export async function detectSubscriptionSupport(wsUrl: string): Promise<boolean> {
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

export function startPollingSync(
	ipfs: IpfsAdapter,
	mmr: MerkleMountainRange,
	storage: StorageAdapter,
	ethereumHttpRpcUrl: string,
	contractAddress: string,
	getLiveSyncRunning: () => boolean,
	setLiveSyncInterval: (interval: ReturnType<typeof setTimeout> | undefined) => void,
	lastProcessedBlock: number,
	setLastProcessedBlock: (blockNumber: number) => void,
	getHighestCommittedLeafIndex: () => number,
	setHighestCommittedLeafIndex: (index: number) => void,
	shouldPut: boolean,
	shouldProvide: boolean,
	pollIntervalMs: number = 10_000,
): void {
	const poll = async () => {
		try {
			const { meta } = await getAccumulatorData(ethereumHttpRpcUrl, contractAddress)
			const latestBlock = meta.previousInsertBlockNumber
			if (latestBlock > lastProcessedBlock) {
				const newEvents = await getLeafInsertLogs(
					ethereumHttpRpcUrl,
					contractAddress,
					lastProcessedBlock + 1,
					latestBlock,
				)
				for (const event of newEvents) {
					await processNewLeafEvent(
						ipfs,
						mmr,
						storage,
						ethereumHttpRpcUrl,
						contractAddress,
						getHighestCommittedLeafIndex,
						setHighestCommittedLeafIndex,
						shouldPut,
						shouldProvide,
						event,
					)
				}
				setLastProcessedBlock(latestBlock)
			}
		} catch (err) {
			console.error("[LiveSync] Error during polling:", err)
		}
		if (getLiveSyncRunning()) {
			setLiveSyncInterval(setTimeout(poll, pollIntervalMs))
		}
	}
	poll()
}

export function startSubscriptionSync(
	ipfs: IpfsAdapter,
	mmr: MerkleMountainRange,
	storage: StorageAdapter,
	ethereumHttpRpcUrl: string,
	ethereumWsRpcUrl: string | undefined,
	ws: WebSocket | undefined,
	setWs: (ws: WebSocket | undefined) => void,
	lastProcessedBlock: number,
	setLastProcessedBlock: (block: number) => void,
	contractAddress: string,
	getHighestCommittedLeafIndex: () => number,
	setHighestCommittedLeafIndex: (index: number) => void,
	shouldPut: boolean,
	shouldProvide: boolean,
): void {
	if (!ethereumWsRpcUrl) {
		console.error("[Accumulator] No ETHEREUM_WS_RPC_URL set. Cannot start subscription sync.")
		return
	}
	if (ws) {
		console.warn("[Accumulator] Subscription WebSocket already running.")
		return
	}
	console.log(`[Accumulator] Connecting to WS: ${ethereumWsRpcUrl}`)

	const newWs = new WebSocket(ethereumWsRpcUrl)
	setWs(newWs)
	newWs.onopen = () => {
		console.log("[Accumulator] WebSocket open. Subscribing to newHeads...")
		const msg = JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_subscribe",
			params: ["newHeads"],
		})
		newWs.send(msg)
	}

	let subscriptionId: string | null = null
	newWs.onmessage = async (event: any) => {
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
					const { meta } = await getAccumulatorData(ethereumHttpRpcUrl, contractAddress)
					const latestBlock = meta.previousInsertBlockNumber
					if (latestBlock > lastProcessedBlock) {
						const newEvents = await getLeafInsertLogs(
							ethereumHttpRpcUrl,
							contractAddress,
							lastProcessedBlock + 1,
							latestBlock,
						)
						for (const event of newEvents) {
							await processNewLeafEvent(
								ipfs,
								mmr,
								storage,
								ethereumHttpRpcUrl,
								contractAddress,
								getHighestCommittedLeafIndex,
								setHighestCommittedLeafIndex,
								shouldPut,
								shouldProvide,
								event,
							)
						}
						setLastProcessedBlock(latestBlock)
					}
				} catch (err) {
					console.error("[LiveSync] Error during WS event processing:", err)
				}
			}
		} catch (err) {
			console.error("[Accumulator] Error parsing WS message:", err)
		}
	}
	newWs.onerror = (err: any) => {
		console.error("[Accumulator] WebSocket error:", err)
	}
	newWs.onclose = () => {
		console.log("[Accumulator] WebSocket closed.")
		setWs(undefined)
	}
}

// Processes a new leaf event and commits it to the MMR.
export async function processNewLeafEvent(
	ipfs: IpfsAdapter,
	mmr: MerkleMountainRange,
	storage: StorageAdapter,
	ethereumHttpRpcUrl: string,
	contractAddress: string,
	getHighestCommittedLeafIndex: () => number,
	setHighestCommittedLeafIndex: (index: number) => void,
	shouldPut: boolean,
	shouldProvide: boolean,
	event: NormalizedLeafInsertEvent,
): Promise<void> {
	// return if we have already processed this leaf
	if (event.leafIndex <= getHighestCommittedLeafIndex()) return

	// if event.leafIndex > highestCommittedLeafIndex + 1:
	if (event.leafIndex > getHighestCommittedLeafIndex() + 1) {
		console.log(
			`[Accumulator] \u{1F4CC} Missing event for leaf indexes ${getHighestCommittedLeafIndex() + 1} to ${event.leafIndex - 1}. Getting them now...`,
		)
		// Walk back through the previousInsertBlockNumber's to get the missing leaves
		const pastEvents: NormalizedLeafInsertEvent[] = await walkBackLeafInsertLogsOrThrow(
			ethereumHttpRpcUrl,
			contractAddress,
			event.leafIndex - 1,
			event.previousInsertBlockNumber,
			getHighestCommittedLeafIndex() + 1,
		)
		for (let i = 0; i < pastEvents.length; i++) {
			await processNewLeafEvent(
				ipfs,
				mmr,
				storage,
				ethereumHttpRpcUrl,
				contractAddress,
				getHighestCommittedLeafIndex,
				setHighestCommittedLeafIndex,
				shouldPut,
				shouldProvide,
				pastEvents[i],
			)
		}
		console.log(`[Accumulator] \u{1F44D} Got the missing events.`)
	}

	// Store the event in the DB
	await putLeafRecordInDB(storage, event.leafIndex, getLeafRecordFromNormalizedLeafInsertEvent(event))

	// Commit the leaf to the MMR
	await commitLeaf(
		ipfs,
		mmr,
		storage,
		shouldPut,
		shouldProvide,
		getHighestCommittedLeafIndex,
		setHighestCommittedLeafIndex,
		event.leafIndex,
		event.newData,
	)

	// === THE FOLLOWING CODE BLOCK CAN BE REMOVED. IT IS JUST A SANITY CHECK. ===
	const { meta } = await getAccumulatorData(ethereumHttpRpcUrl, contractAddress)
	// This sanity check only makes sense when the node is fully synced
	if (getHighestCommittedLeafIndex() === meta.leafCount - 1) {
		try {
			const localRootCid = await mmr.rootCIDAsBase32()
			const onChainRootCid = await getLatestCID(ethereumHttpRpcUrl, contractAddress)
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
