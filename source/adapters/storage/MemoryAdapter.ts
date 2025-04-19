import type { StorageAdapter } from '../../interfaces/StorageAdapter.ts'

/**
 * MemoryAdapter implements StorageAdapter for tests/in-memory use.
 */
export class MemoryAdapter implements StorageAdapter {
  private store: Map<string, any>
  constructor() {
    this.store = new Map()
  }
  async put(key: string, value: any): Promise<void> {
    this.store.set(key, value)
  }
  async get(key: string): Promise<any | undefined> {
    return this.store.get(key)
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
  async *iterate(prefix: string): AsyncIterable<{ key: string, value: any }> {
    for (const [key, value] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        yield { key, value }
      }
    }
  }
  async getMaxKey(prefix: string): Promise<number | undefined> {
    let max: number | undefined = undefined
    for (const key of this.store.keys()) {
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
