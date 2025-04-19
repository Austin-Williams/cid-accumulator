import type { StorageAdapter } from '../../interfaces/StorageAdapter.ts'
import Database from 'better-sqlite3'

/**
 * SqliteAdapter implements StorageAdapter for Node.js using better-sqlite3.
 * Stores key-value pairs in a single table.
 */
export class SqliteAdapter implements StorageAdapter {
  private db: Database.Database
  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath)
    this.db.exec(`CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT
    );`)
  }
  async put(key: string, value: any): Promise<void> {
    this.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  }
  async get(key: string): Promise<any | undefined> {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value?: string } | undefined
    if (!row || row.value === undefined) return undefined
    return JSON.parse(row.value)
  }
  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(key)
  }
  async *iterate(prefix: string): AsyncIterable<{ key: string, value: any }> {
    const stmt = this.db.prepare('SELECT key, value FROM kv WHERE key LIKE ?')
    for (const row of stmt.iterate(`${prefix}%`) as Iterable<{ key: string, value: string }>) {
      yield { key: row.key, value: JSON.parse(row.value) }
    }
  }
  async getMaxKey(prefix: string): Promise<number | undefined> {
    const stmt = this.db.prepare('SELECT key FROM kv WHERE key LIKE ?')
    let max: number | undefined = undefined
    for (const row of stmt.iterate(`${prefix}%`) as Iterable<{ key: string }>) {
      const key: string = row.key
      const suffix = key.slice(prefix.length)
      const num = parseInt(suffix)
      if (!isNaN(num) && (max === undefined || num > max)) {
        max = num
      }
    }
    return max
  }
}
