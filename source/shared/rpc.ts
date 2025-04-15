// shared/rpc.ts
export async function retryRpcCall<T>(
	fn: () => Promise<T>,
	retries = 3,
	delayMs = 1000
): Promise<T> {
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await fn()
		} catch (err) {
			if (attempt === retries) throw err
			const backoff = Math.min(delayMs * 2 ** attempt, 30000) // cap at 30s
			const jitter = Math.floor(Math.random() * 1000) // random 0-1000ms
			const wait = backoff + jitter
			console.warn(`[rpc] Call failed (attempt ${attempt + 1}/${retries}). Retrying in ${wait}ms...`)
			await new Promise(res => setTimeout(res, wait))
		}
	}
	throw new Error('Unreachable')
}
