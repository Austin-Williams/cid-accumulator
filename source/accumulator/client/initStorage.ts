import { getStorageNamespace } from "./storageNamespace.ts"
import type { AccumulatorClientConfig } from "../../types/types.ts"
import type { StorageNamespace } from "../../types/types.ts"
import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { isBrowser } from "../../utils/envDetection.ts"
import { IndexedDBAdapter } from "../../adapters/storage/IndexedDBAdapter.ts"

export async function initStorage(config: AccumulatorClientConfig): Promise<StorageNamespace> {
	// Create a Storage adapter appropriate for the environment
	let storageAdapter: StorageAdapter
	if (isBrowser()) {
		storageAdapter = new IndexedDBAdapter()
	} else {
		const module = await import("../../adapters/storage/JSMapAdapter.ts")
		storageAdapter = new module.JSMapAdapter(config.DB_PATH)
	}
	// Initialize the Storage namespace
	return getStorageNamespace(storageAdapter)
}
