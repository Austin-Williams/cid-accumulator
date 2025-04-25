import { UniversalIpfsAdapter } from "../../adapters/ipfs/UniversalIpfsAdapter.ts"
import { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import { IpfsNamespace, AccumulatorClientConfig } from "../../types/types.ts"
import { isNodeJs } from "../../utils/envDetection.ts"
import { getIpfsNamespace } from "./ipfsNamespace.ts"
import { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { NULL_CID } from "../../utils/constants.ts"
import * as dagCbor from "../../utils/dagCbor.ts"

export async function initIpfs(
	config: AccumulatorClientConfig,
	storageAdapter: StorageAdapter,
): Promise<IpfsNamespace> {
	// Create an IPFS adapter
	const ipfsAdapter: IpfsAdapter = new UniversalIpfsAdapter(
		config.IPFS_GATEWAY_URL,
		config.IPFS_API_URL,
		config.IPFS_PUT_IF_POSSIBLE,
		config.IPFS_PIN_IF_POSSIBLE,
		config.IPFS_PROVIDE_IF_POSSIBLE,
	)

	let shouldPut = config.IPFS_PUT_IF_POSSIBLE && config.IPFS_API_URL !== undefined
	let shouldPin = config.IPFS_PIN_IF_POSSIBLE && config.IPFS_API_URL !== undefined
	let shouldProvide = config.IPFS_PROVIDE_IF_POSSIBLE && config.IPFS_API_URL !== undefined && isNodeJs()
	if (!shouldPut) shouldPin = false // Doesn't make sense to pin if they don't put
	if (!shouldPin) shouldProvide = false // Doesn't make sense to provide if they don't pin

	// Check if IPFS Gateway connection is working
	console.log("[Accumulator] \u{1F440} Checking IPFS Gateway connection...")
	try {
		// Attempt to fetch a block
		await ipfsAdapter.getBlock(NULL_CID)
		console.log("[Accumulator] \u{2705} Connected to IPFS Gateway.")
	} catch (e) {
		console.error("[Accumulator] \u{274C} Failed to connect to IPFS Gateway:", e)
		throw new Error("Failed to connect to IPFS Gateway. Must abort. See above error.")
	}

	// If relevant, check that IPFS API connection can PUT/PIN
	if (shouldPut) {
		console.log("[Accumulator] \u{1F440} Checking IPFS API connection (attempting to PUT a block)...")
		try {
			// Attempt to put a block
			await ipfsAdapter.putBlock(NULL_CID, dagCbor.encode(null))
			console.log("[Accumulator] \u{2705} Connected to IPFS API and verified it can PUT blocks.")
		} catch (e) {
			shouldPut = false
			shouldPin = false
			console.error("[Accumulator] \u{274C} Failed to connect to IPFS API:", e)
			console.log("[Accumulator] 🤷‍♂️ Will continue without IPFS API connection (Using IPFS Gateway only).")
		}
	}

	// If relevant, check that IPFS API connection can PUT/PIN
	if (shouldProvide && shouldPut) {
		console.log("[Accumulator] \u{1F440} Checking if IPFS API can provide (advertise) blocks...")
		try {
			// Attempt to provide a block
			await ipfsAdapter.provide(NULL_CID)
			console.log("[Accumulator] \u{2705} Connected to IPFS API and verified it can PROVIDE blocks.")
		} catch (e) {
			shouldProvide = false
			console.error("[Accumulator] \u{274C} Failed to verify that the IPFS API can provide (advertise) blocks.", e)
			console.log("[Accumulator] 🤷‍♂️ Will continue without telling IPFS API to provide (advertise) blocks.")
		}
	}

	// Initialize the IPFS namespace object
	const ipfs = getIpfsNamespace(ipfsAdapter, storageAdapter, shouldPut, shouldPin, shouldProvide)

	console.log("[Accumulator] 📜 IPFS Capability Summary:")
	console.log(`[Accumulator] 📜 Summary: IPFS Gateway connected: YES`)
	console.log(`[Accumulator] 📜 Summary: IPFS API PUT is set up: ${shouldPut ? "YES" : "NO"}`)
	console.log(`[Accumulator] 📜 Summary: IPFS API PIN is set up: ${shouldPin ? "YES" : "NO"}`)
	console.log(`[Accumulator] 📜 Summary: IPFS API PROVIDE is set up: ${shouldProvide ? "YES" : "NO"}`)

	return ipfs
}
