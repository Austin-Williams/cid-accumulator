import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import { promises as fs } from "fs"

/**
 * JSMapAdapter implements StorageAdapter using a native Map,
 * with persistence to a local file (JSON-serialized).
 * No external dependencies required. Suitable for moderate datasets (~100k entries).
 */
export class JSMapAdapter implements StorageAdapter {
	private store: Map<string, string> = new Map()
	private filePath: string

	constructor(filePath: string) {
		this.filePath = filePath
	}

	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value)
	}

	async get(key: string): Promise<string | undefined> {
		return this.store.get(key)
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key)
	}

	async *iterate(prefix: string): AsyncIterable<{ key: string; value: string }> {
		for (const [key, value] of this.store.entries()) {
			if (key.startsWith(prefix)) {
				yield { key, value }
			}
		}
	}

	async open(): Promise<void> {
		// Load from disk if file exists
		try {
			const data = await fs.readFile(this.filePath, "utf8")
			const obj = JSON.parse(data)
			this.store = new Map(Object.entries(obj))
		} catch (err: any) {
			if (err.code !== "ENOENT") throw err // Ignore file-not-found
		}
	}

	async persist(): Promise<void> {
		const obj: Record<string, string> = Object.fromEntries(this.store)
		await fs.writeFile(this.filePath, JSON.stringify(obj), "utf8")
	}

	async close(): Promise<void> {
		// Persist to disk as JSON (for compatibility)
		await this.persist()
	}
}
