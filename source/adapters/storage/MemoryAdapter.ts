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

	async clear(): Promise<void> {
		this.store.clear()
	}

	async *iterate(prefix: string): AsyncIterable<{ key: string; value: string }> {
		for (const [key, value] of this.store.entries()) {
			if (key.startsWith(prefix)) {
				yield { key, value }
			}
		}
	}

	async open(): Promise<void> {
		// No-op for in-memory adapter
		return
	}

	async close(): Promise<void> {
		// No-op for in-memory adapter
		return
	}

	// --- Dummy IpfsAdapter methods for compatibility ---
	async pin(_cid: any): Promise<void> {
		// No-op for memory adapter
		return
	}

	async provide(_cid: any): Promise<void> {
		// No-op for memory adapter
		return
	}
}
