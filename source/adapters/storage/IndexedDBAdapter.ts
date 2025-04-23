// IndexedDBAdapter: Persistent browser storage
// Implements the StorageAdapter interface for use in browser environments

import type { StorageAdapter } from "../../interfaces/StorageAdapter.js"

export class IndexedDBAdapter implements StorageAdapter {
	private dbName: string
	private storeName: string
	private dbPromise: Promise<IDBDatabase>

	constructor(dbName = "cid-accumulator", storeName = "kv") {
		this.dbName = dbName
		this.storeName = storeName
		this.dbPromise = this.openDB()
	}

	private openDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const req = indexedDB.open(this.dbName, 1)
			req.onupgradeneeded = () => {
				req.result.createObjectStore(this.storeName)
			}
			req.onsuccess = () => resolve(req.result)
			req.onerror = () => reject(req.error)
		})
	}

	private async withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
		const db = await this.dbPromise
		return new Promise<T>((resolve, reject) => {
			const tx = db.transaction(this.storeName, mode)
			const store = tx.objectStore(this.storeName)
			const req = fn(store)
			req.onsuccess = () => resolve(req.result as T)
			req.onerror = () => reject(req.error)
		})
	}

	async get(key: string): Promise<string | undefined> {
		return await this.withStore("readonly", (store) => store.get(key))
	}

	async put(key: string, value: string): Promise<void> {
		await this.withStore("readwrite", (store) => store.put(value, key))
	}

	async delete(key: string): Promise<void> {
		await this.withStore("readwrite", (store) => store.delete(key))
	}

	async *iterate(prefix: string): AsyncIterable<{ key: string; value: string }> {
		const db = await this.dbPromise
		const tx = db.transaction(this.storeName, "readonly")
		const store = tx.objectStore(this.storeName)
		const req = store.openCursor()
		// Wrap cursor iteration in a promise to collect results, then yield
		const results: { key: string; value: string }[] = await new Promise((resolve, reject) => {
			const out: { key: string; value: string }[] = []
			req.onsuccess = () => {
				const cursor = req.result as IDBCursorWithValue | null
				if (cursor) {
					if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
						out.push({ key: cursor.key, value: cursor.value })
					}
					cursor.continue()
				} else {
					resolve(out)
				}
			}
			req.onerror = () => reject(req.error)
		})
		for (const item of results) {
			yield item
		}
	}

	async open(): Promise<void> {
		await this.dbPromise
	}

	async persist(): Promise<void> {
		// No-op for IndexedDB, auto-persistent
	}

	async close(): Promise<void> {
		// IndexedDB does not require explicit close
	}
}
