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

	constructor(filePath: string | undefined) {
		this.filePath = filePath ?? "./db/cli-accumulator.json"
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

	/**
	 * Creates an index of all entries keyed by a substring of their payload.
	 * @param keyPrefix The prefix of the keys to index (e.g. "leaf:")
	 * @param offset The starting index of the substring.
	 * @param length The length of the substring.
	 */
	async createIndexByPayloadSlice(keyPrefix: string, offset: number, length: number): Promise<Map<string, string[]>> {
		const index = new Map<string, string[]>()
		for (const [key, value] of this.store.entries()) {
			if (!key.startsWith(keyPrefix)) continue
			const slice = value.slice(offset, offset + length)
			if (!index.has(slice)) index.set(slice, [])
			index.get(slice)!.push(value)
		}
		return index
	}
}
