export interface StorageAdapter {
  put(key: string, value: any): Promise<void>
  get(key: string): Promise<any | undefined>
  delete(key: string): Promise<void>

  /**
   * Returns an async iterator over all records whose keys start with the given prefix.
   */
  iterate(prefix: string): AsyncIterable<{ key: string, value: any }>

  /**
   * Returns the maximum numeric suffix for keys matching the prefix (e.g., for 'leaf:' finds highest leafIndex).
   * Returns undefined if no such keys exist.
   */
  getMaxKey(prefix: string): Promise<number | undefined>
}
