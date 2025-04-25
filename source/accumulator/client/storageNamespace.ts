import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts";
import type { StorageNamespace, LeafRecord } from "../../types/types.ts";
import {
  getLeafRecord,
  putLeafRecordInDB,
  getHighestContiguousLeafIndexWithData,
  getLeafIndexesWithMissingNewData,
  getCIDDataPairFromDB,
  iterateTrailPairs
} from "./storageHelpers.ts";

/**
 * Returns a StorageNamespace object with methods bound to the given storage adapter.
 */
export function getStorageNamespace(storage: StorageAdapter): StorageNamespace {
  return {
		storageAdapter: storage,
		getLeafRecord: async (index: number) => {
			const result = await getLeafRecord(storage, index)
			return result === undefined ? null : result
		},
		putLeafRecord: async (index: number, value: LeafRecord) => {
			await putLeafRecordInDB(storage, index, value)
		},
    getHighestContiguousLeafIndexWithData: () => getHighestContiguousLeafIndexWithData(storage),
    getLeafIndexesWithMissingNewData: async () => {
      const maxLeafIndex = await getHighestContiguousLeafIndexWithData(storage);
      return getLeafIndexesWithMissingNewData(storage, maxLeafIndex);
    },
    getCIDDataPairFromDB: (index: number) => getCIDDataPairFromDB(storage, index),
    iterateTrailPairs: () => iterateTrailPairs(storage),
    get: (key: string) => storage.get(key),
    put: (key: string, value: string) => storage.put(key, value),
    delete: (key: string) => storage.delete(key)
  };
}