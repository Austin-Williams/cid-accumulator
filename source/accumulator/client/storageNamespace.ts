import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import type { StorageNamespace, LeafRecord } from "../../types/types.ts"
import {
	getLeafRecord,
	putLeafRecordInDB,
	getHighestContiguousLeafIndexWithData,
	getLeafIndexesWithMissingNewData,
	getCIDDataPairFromDB,
	iterateTrailPairs,
} from "./storageHelpers.ts"

/**
 * Returns a StorageNamespace object with methods bound to the given storage adapter.
 */
export function getStorageNamespace(storageAdapter: StorageAdapter): StorageNamespace {
	const sync = {
		storageAdapter: storageAdapter,
		getLeafRecord: async (index: number) => {
			const result = await getLeafRecord(sync.storageAdapter, index)
			return result === undefined ? null : result
		},
		putLeafRecord: async (index: number, value: LeafRecord) => {
			await putLeafRecordInDB(sync.storageAdapter, index, value)
		},
		getHighestContiguousLeafIndexWithData: () => getHighestContiguousLeafIndexWithData(sync.storageAdapter),
		getLeafIndexesWithMissingNewData: async () => {
			const maxLeafIndex = await getHighestContiguousLeafIndexWithData(sync.storageAdapter)
			return getLeafIndexesWithMissingNewData(sync.storageAdapter, maxLeafIndex)
		},
		getCIDDataPairFromDB: (index: number) => getCIDDataPairFromDB(sync.storageAdapter, index),
		iterateTrailPairs: () => iterateTrailPairs(sync.storageAdapter),
		get: (key: string) => sync.storageAdapter.get(key),
		put: (key: string, value: string) => sync.storageAdapter.put(key, value),
		delete: (key: string) => sync.storageAdapter.delete(key),
	}
	return sync
}
