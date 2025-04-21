export interface StorageAdapter {
	put(key: string, value: string): Promise<void>
	get(key: string): Promise<string | undefined>
	delete(key: string): Promise<void>

	/**
	 * Returns an async iterator over all records whose keys start with the given prefix.
	 */
	iterate(prefix: string): AsyncIterable<{ key: string; value: string }>
}

