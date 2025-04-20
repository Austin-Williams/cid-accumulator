/**
 * Makes a raw Ethereum JSON-RPC call using fetch.
 * @param rpcUrl string (Ethereum node endpoint)
 * @param method string (JSON-RPC method)
 * @param params any[] (JSON-RPC params)
 * @param id number (request id, default 1)
 * @returns Promise<any> (result field from response)
 */
export async function ethRpcFetch(rpcUrl: string, method: string, params: any[], id = 1): Promise<any> {
	const res = await fetch(rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method,
			params,
			id,
		}),
	})
	const json = await res.json()
	if (json.error) throw new Error(json.error.message)
	return json.result
}

/**
 * Finds LeafInsert events using eth_getLogs.
 * @param rpcUrl string
 * @param contractAddress string
 * @param eventTopic string (keccak256 hash of event signature)
 * @param fromBlock string (hex or "latest")
 * @param toBlock string (hex or "latest")
 * @returns Promise<any[]> (array of log objects)
 */
export async function getLeafInsertLogs(
	rpcUrl: string,
	contractAddress: string,
	eventTopic: string,
	fromBlock: string,
	toBlock: string,
) {
	return ethRpcFetch(rpcUrl, "eth_getLogs", [
		{
			address: contractAddress,
			topics: [eventTopic],
			fromBlock,
			toBlock,
		},
	])
}

/**
 * Finds a LeafInsert log for a specific leaf index using eth_getLogs.
 * @param rpcUrl string
 * @param contractAddress string
 * @param eventTopic string (keccak256 hash of event signature)
 * @param fromBlock string (hex or "latest")
 * @param toBlock string (hex or "latest")
 * @param targetLeafIndex number (the leaf index to filter for)
 * @returns Promise<any[]> (array of log objects for that leaf index)
 */
export async function getLeafInsertLogForTargetLeafIndex(
	rpcUrl: string,
	contractAddress: string,
	eventTopic: string,
	fromBlock: string,
	toBlock: string,
	targetLeafIndex: number,
) {
	const leafIndexTopic = "0x" + targetLeafIndex.toString(16).padStart(64, "0")
	const topics = [eventTopic, leafIndexTopic]
	return ethRpcFetch(rpcUrl, "eth_getLogs", [
		{
			address: contractAddress,
			topics,
			fromBlock,
			toBlock,
		},
	])
}

/**
 * Calls a contract view function (e.g., getAccumulatorData, getLatestCID) using eth_call.
 * @param rpcUrl string
 * @param contractAddress string
 * @param data string (ABI-encoded call data)
 * @param blockTag string (default: "latest")
 * @returns Promise<string> (ABI-encoded result)
 */
export async function callContractView(
	rpcUrl: string,
	contractAddress: string,
	data: string,
	blockTag: string = "latest",
) {
	return ethRpcFetch(rpcUrl, "eth_call", [{ to: contractAddress, data }, blockTag])
}

/**
 * Wraps an async RPC function with throttling and retry logic.
 * @param fetchFn The async function to throttle (e.g., ethRpcFetch)
 * @param opts ThrottledProviderOptions
 * @returns A throttled version of fetchFn
 */
import { ThrottledProviderOptions } from "./ThrottledProvider.ts"

export function createThrottledRpcFetch<T extends (...args: any[]) => Promise<any>>(
	fetchFn: T,
	opts: ThrottledProviderOptions = {},
): T {
	let lastCallTimestamp = 0
	const minDelayMs = opts.minDelayMs ?? 200
	const maxRetries = opts.maxRetries ?? 5
	const jitterMs = opts.jitterMs ?? 100
	const backoffFactor = opts.backoffFactor ?? 2
	const logger = opts.logger ?? (() => {})

	const throttled = async function (...args: any[]): Promise<any> {
		let attempt = 0
		let delay = minDelayMs
		while (true) {
			const now = Date.now()
			const sinceLast = now - lastCallTimestamp
			if (sinceLast < minDelayMs) {
				await new Promise((res) => setTimeout(res, minDelayMs - sinceLast))
			}
			const jitter = Math.floor(Math.random() * jitterMs)
			await new Promise((res) => setTimeout(res, jitter))
			lastCallTimestamp = Date.now()
			try {
				return await fetchFn(...args)
			} catch (e) {
				logger(`Fetch attempt ${attempt + 1} failed:`, e)
				if (++attempt > maxRetries) throw e
				await new Promise((res) => setTimeout(res, delay))
				delay *= backoffFactor
			}
		}
	}
	return throttled as T
}
