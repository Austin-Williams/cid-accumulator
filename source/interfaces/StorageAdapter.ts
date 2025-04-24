// We use strings for both keys and values since that is compatible with most storage solutions
export interface StorageAdapter {
	put(key: string, value: string): Promise<void>
	get(key: string): Promise<string | undefined>
	delete(key: string): Promise<void>
	open(): Promise<void>
	close(): Promise<void>
	// Returns an async iterator over all records whose keys start with the given prefix.
	iterate(prefix: string): AsyncIterable<{ key: string; value: string }>
	// Explicitly persist in-memory data to disk (if supported by the adapter)
	persist(): Promise<void>
}
