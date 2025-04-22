import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"

/**
 * IndexedDbAdapter implements StorageAdapter for browser persistent storage.
 * Uses idb-keyval or Dexie.js under the hood (to be implemented).
 */
export class IndexedDbAdapter implements StorageAdapter {
	private dbName: string
	constructor(_dbName: string) {
		this.dbName = _dbName
		// TODO: Set up Dexie or idb-keyval instance
	}
	async put(_key: string, _value: any): Promise<void> {
		// TODO: Implement IndexedDB put
	}
	async get(_key: string): Promise<any | undefined> {
		// TODO: Implement IndexedDB get
	}
	async delete(_key: string): Promise<void> {
		// TODO: Implement IndexedDB delete
	}
	async *iterate(_prefix: string): AsyncIterable<{ key: string; value: any }> {
		// TODO: Use Dexie.js or idb-keyval cursor to efficiently iterate by prefix
		// Example: for await (const [key, value] of db.where('key').startsWith(prefix))
	}

	async open(): Promise<void> {
		// TODO: Implement open logic for IndexedDB (Dexie.js or idb-keyval)
		return
	}

	async close(): Promise<void> {
		// TODO: Implement close logic for IndexedDB (Dexie.js or idb-keyval)
		return
	}
}
