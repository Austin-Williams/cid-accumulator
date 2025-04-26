import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"

/**
 * MemoryAdapter implements StorageAdapter for tests/in-memory use.
 */
export class MemoryAdapter implements StorageAdapter {
	private store: Map<string, any> = new Map()

	async get(key: string): Promise<string | undefined> {
		return this.store.get(key)
	}

	async put(key: string, value: string): Promise<void> {
		this.store.set(key, value)
	}

	async delete(key: string): Promise<void> {
		this.store.delete(key)
	}

	async open(): Promise<void> {
		// No-op for in-memory adapter
		return
	}

	async close(): Promise<void> {
		// No-op for in-memory adapter
		return
	}

	async persist(): Promise<void> {
		// No-op for in-memory adapter
		return
	}

	async *iterate(keyPrefix: string): AsyncIterable<{ key: string; value: string }> {
		for (const [key, value] of this.store.entries()) {
			if (key.startsWith(keyPrefix)) {
				yield { key, value }
			}
		}
	}

	async createIndexByPayloadSlice(offset: number, length: number): Promise<Map<string, string[]>> {
		const index = new Map<string, string[]>()
		for (const [key, value] of this.store.entries()) {
			if (!key.startsWith("leaf:")) continue
			const slice = value.slice(offset, offset + length)
			if (!index.has(slice)) index.set(slice, [])
			index.get(slice)!.push(value)
		}
		return index
	}
}
