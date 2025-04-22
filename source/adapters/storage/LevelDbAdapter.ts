// import type { Level } from "level"
// import type { StorageAdapter } from "../../interfaces/StorageAdapter.js"

// /**
//  * Basic LevelDbAdapter: stores and retrieves string values only.
//  */
// export class LevelDbAdapter implements StorageAdapter {
// 	private db: Level<string, string>

// 	constructor(db: Level<string, string>) {
// 		this.db = db
// 	}

// 	async delete(key: string): Promise<void> {
// 		await this.db.del(key)
// 	}

// 	async *iterate(prefix: string): AsyncIterable<{ key: string; value: string }> {
// 		const iterator = this.db.iterator({ keys: true, values: true, valueEncoding: "utf8" }) as any
// 		const next: () => Promise<[string | undefined, string | undefined]> = () => {
// 			return new Promise((resolve, reject) => {
// 				iterator.next((err: any, k: string | undefined, v: string | undefined) => {
// 					if (err) return reject(err)
// 					resolve([k, v])
// 				})
// 			})
// 		}
// 		try {
// 			while (true) {
// 				const [key, value] = await next()
// 				if (key === undefined) break
// 				if (key.startsWith(prefix) && typeof value === "string") {
// 					yield { key, value }
// 				}
// 			}
// 		} finally {
// 			await iterator.end()
// 		}
// 	}

// 	async put(key: string, value: string): Promise<void> {
// 		await this.db.put(key, value, { valueEncoding: "utf8" })
// 	}

// 	async get(key: string): Promise<string | undefined> {
// 		try {
// 			return await this.db.get(key, { valueEncoding: "utf8" })
// 		} catch (err: any) {
// 			if (err.notFound) return undefined
// 			throw err
// 		}
// 	}

// 	async open(): Promise<void> {
// 		// LevelDB's open() returns a promise
// 		if (typeof this.db.open === "function") {
// 			await this.db.open()
// 		}
// 	}

// 	async persist(): Promise<void> {
// 		// LevelDB persists automatically; no-op for interface compliance
// 		return
// 	}

// 	async close(): Promise<void> {
// 		// LevelDB's close() returns a promise
// 		if (typeof this.db.close === "function") {
// 			await this.db.close()
// 		}
// 	}
// }
