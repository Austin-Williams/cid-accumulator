import { ethers } from "ethers"

export interface ThrottledProviderOptions {
	minDelayMs?: number // Minimum delay between calls
	maxRetries?: number // Max number of retries
	jitterMs?: number // Maximum jitter to add (randomized per call)
	backoffFactor?: number // Multiplier for exponential backoff
	logger?: (...args: any[]) => void
}

export class ThrottledProvider {
	private provider: ethers.JsonRpcProvider
	private minDelayMs: number
	private maxRetries: number
	private jitterMs: number
	private backoffFactor: number
	private logger: (...args: any[]) => void
	private lastCallTimestamp: number = 0

	constructor(provider: ethers.JsonRpcProvider, opts: ThrottledProviderOptions = {}) {
		this.provider = provider
		this.minDelayMs = opts.minDelayMs ?? 200
		this.maxRetries = opts.maxRetries ?? 5
		this.jitterMs = opts.jitterMs ?? 100
		this.backoffFactor = opts.backoffFactor ?? 2
		this.logger = opts.logger ?? (() => {})
		return new Proxy(this, {
			get: (target, prop, receiver) => {
				// Allow direct access to wrapper properties
				if (prop in target) return Reflect.get(target, prop, receiver)
				// Proxy all other calls to the underlying provider with throttling/retry
				const orig = (this.provider as any)[prop]
				if (typeof orig === "function") {
					return (...args: any[]) => this.callWithThrottling(prop as string, orig, args)
				}
				return orig
			},
		})
	}

	private async callWithThrottling(method: string, fn: (...args: any[]) => Promise<any>, args: any[]): Promise<any> {
		let attempt = 0
		let delay = this.minDelayMs
		while (true) {
			// Enforce min delay + jitter between calls
			const now = Date.now()
			const sinceLast = now - this.lastCallTimestamp
			const jitter = Math.floor(Math.random() * this.jitterMs)
			if (sinceLast < this.minDelayMs + jitter) {
				await new Promise((r) => setTimeout(r, this.minDelayMs + jitter - sinceLast))
			}
			this.lastCallTimestamp = Date.now()
			try {
				return await fn.apply(this.provider, args)
			} catch (err) {
				attempt++
				this.logger(`[ThrottledProvider] Error on ${method} (attempt ${attempt}):`, err)
				if (attempt > this.maxRetries) throw err
				const backoffMs = delay + Math.floor(Math.random() * this.jitterMs);
				console.log(`[ThrottledProvider] Backoff: retrying ${method} in ${backoffMs}ms (attempt ${attempt})`);
				await new Promise((r) => setTimeout(r, backoffMs))
				delay *= this.backoffFactor
			}
		}
	}
}
