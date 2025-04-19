import type { Level } from "level"
import type { StorageAdapter } from "../../interfaces/StorageAdapter.js"

/**
 * LevelDbAdapter implements StorageAdapter for Node.js using LevelDB.
 */
export class LevelDbAdapter implements StorageAdapter {
	private db: Level
	constructor(db: Level) {
		this.db = db
	}
	async put(key: string, value: any): Promise<void> {
		await this.db.put(key, value)
	}
	async get(key: string): Promise<any | undefined> {
		try {
			return await this.db.get(key)
		} catch (e: any) {
			if (e.notFound) return undefined
			throw e
		}
	}
	async delete(key: string): Promise<void> {
		await this.db.del(key)
	}
	async *iterate(prefix: string): AsyncIterable<{ key: string; value: any }> {
		for await (const [key, value] of this.db.iterator({ keys: true, values: true })) {
			if (key.startsWith(prefix)) {
				yield { key, value }
			}
		}
	}
	async getMaxKey(prefix: string): Promise<number | undefined> {
		let max: number | undefined = undefined
		for await (const [key] of this.db.iterator({ keys: true, values: false })) {
			if (key.startsWith(prefix)) {
				const suffix = key.slice(prefix.length)
				const num = parseInt(suffix)
				if (!isNaN(num) && (max === undefined || num > max)) {
					max = num
				}
			}
		}
		return max
	}
}
