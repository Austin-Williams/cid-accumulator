import { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { DataNamespace } from "../../types/types.ts"
import { downloadAll } from "./dataHelpers.ts"

export function getDataNamespace(
	storageAdapter: StorageAdapter,
	getHighestCommittedLeafIndex: () => number,
	onNewLeaf: (callback: (index: number, data: string) => void) => () => void,
): DataNamespace {
	return {
		getHighestIndex: async () => getHighestCommittedLeafIndex(),
		getData: async (index: number) => {
			const dataString: string | undefined = await storageAdapter.get(`leaf:${index}:newData`)
			if (!dataString) return undefined
			return dataString
		},
		getRange: async (fromIndex: number, toIndex: number) => {
			if (fromIndex < 0) fromIndex = 0
			if (toIndex < 0) toIndex = 0
			if (fromIndex > getHighestCommittedLeafIndex()) fromIndex = getHighestCommittedLeafIndex()
			if (toIndex > getHighestCommittedLeafIndex()) toIndex = getHighestCommittedLeafIndex()
			if (fromIndex > toIndex) return []
			const results: Array<{ index: number; data: string }> = []
			for (let i = fromIndex; i <= toIndex; i++) {
				const dataString: string | undefined = await storageAdapter.get(`leaf:${i}:newData`)
				if (dataString) {
					results.push({
						index: i,
						data: dataString,
					})
				}
			}
			return results
		},
		subscribe: (callback) => onNewLeaf(callback),
		downloadAll: async () => downloadAll(storageAdapter, "leaf:"),
		iterate: storageAdapter.iterate,
		createIndexByPayloadSlice: storageAdapter.createIndexByPayloadSlice,
	}
}
