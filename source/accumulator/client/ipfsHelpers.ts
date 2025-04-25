import { CID } from "../../utils/CID.ts"
import type { CIDDataPair, DagCborEncodedData } from "../../types/types.ts"
import { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import { resolveMerkleTreeOrThrow } from "../../ipfs/ipfs.ts"
import { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { verifyCIDAgainstDagCborEncodedDataOrThrow } from "../../utils/verifyCID.ts"
import { getCIDDataPairFromDB, putLeafRecordInDB } from "./storageHelpers.ts"

// ====================================================
// IPFS OPERATIONS
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
export async function getAndResolveCID(
	ipfs: IpfsAdapter,
	storage: StorageAdapter,
	cid: CID<unknown, 113, 18, 1>,
	opts?: { signal?: AbortSignal },
): Promise<boolean> {
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
		const leavesPromise = resolveMerkleTreeOrThrow(cid, ipfs)
		const leaves = await (abortPromise ? Promise.race([leavesPromise, abortPromise]) : leavesPromise)
		for (let i = 0; i < leaves.length; i++)
			await putLeafRecordInDB(storage, i, { newData: leaves[i], __type: "LeafRecord" })
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
export function rePinAllDataToIPFS(
	ipfs: IpfsAdapter,
	storage: StorageAdapter,
	shouldPut: boolean,
	shouldPin: boolean,
	shouldProvide: boolean,
): void {
	if (!shouldPin) {
		console.log(`[Accumulator] ℹ️ rePinAllDataToIPFS skipped because this.shouldPin == false`)
		return
	}
	storage.get("dag:trail:maxIndex").then((result) => {
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
					const pair: CIDDataPair | null = await getCIDDataPairFromDB(storage, i)
					if (!pair) throw new Error(`[Accumulator] Expected CIDDataPair for leaf ${i}`)

					const putOk = await putPinProvideToIPFS(ipfs, shouldPut, shouldProvide, pair.cid, pair.dagCborEncodedData)
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
export async function putPinProvideToIPFS(
	ipfs: IpfsAdapter,
	shouldPut: boolean,
	shouldProvide: boolean,
	cid: CID<unknown, 113, 18, 1>,
	dagCborEncodedData: DagCborEncodedData,
): Promise<boolean> {
	await verifyCIDAgainstDagCborEncodedDataOrThrow(dagCborEncodedData, cid)
	if (shouldPut) {
		try {
			await ipfs.putBlock(cid, dagCborEncodedData)
		} catch (err) {
			console.error(`[Accumulator] \u{1F4A5} IPFS put failed for CID ${cid}:`, err)
			return false
		}
	}
	if (shouldProvide) {
		try {
			await ipfs.provide(cid)
		} catch (err) {
			console.error(`[Accumulator] IPFS provide failed for CID ${cid}:`, err)
		}
	}
	return true
}
