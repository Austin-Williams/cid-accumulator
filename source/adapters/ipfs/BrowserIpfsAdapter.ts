import { CID } from "../../utils/CID.js"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"

/**
 * BrowserIpfsAdapter: Implements get put (with pin = true) but not
 * 'provide' because dht/provide is often not allowed via HTTP API in browser.
 * Use this for browser environments where dht/provide is not allowed.
 */
export class BrowserIpfsAdapter implements IpfsAdapter {
	private apiUrl: string

	constructor(apiUrl: string) {
		this.apiUrl = apiUrl.replace(/\/$/, "") // Remove trailing slash
	}

	/**
	 * Get a block by CID from IPFS.
	 */
	async get(cid: CID<unknown, 113, 18, 1>): Promise<Uint8Array> {
		const url = `${this.apiUrl}/api/v0/block/get?arg=${cid.toString()}`
		const res = await fetch(url, { method: "POST" })
		if (!res.ok) throw new Error(`IPFS block/get failed: ${res.status} ${res.statusText}`)
		// Verify that the data we received matches the CID we requested
		const data = new Uint8Array(await res.arrayBuffer())
		const receivedCid = (data)
		if (receivedCid.toString() !== cid.toString())
			throw new Error(`IPFS block/get failed: CID mismatch: ${receivedCid} !== ${cid}`)
		return data
	}

	/**
	 * Put a block (dag-cbor, sha2-256, CIDv1) to IPFS.
	 * Note: The CID is not used directly; IPFS computes it from the data.
	 */
	async put(_cid: CID<unknown, 113, 18, 1>, data: Uint8Array): Promise<void> {
		const url = `${this.apiUrl}/api/v0/block/put?format=dag-cbor&mhtype=sha2-256&pin=true`
		const form = new FormData()
		form.append("data", new Blob([data]))
		const res = await fetch(url, {
			method: "POST",
			body: form,
			// fetch sets Content-Type for multipart automatically
		})
		if (!res.ok) throw new Error(`IPFS block/put failed: ${res.status} ${res.statusText}`)
		// Optionally, parse response for CID, but not required for interface
	}

	/**
	 * No-op. Explicit pinning is not supported here because:
	 * - When data is available, block/put with pin=true is used.
	 * - pin/add is unreliable if the block is not already present locally.
	 * If you need to guarantee pinning, ensure you use put() with pin=true and provide the data.
	 */
	async pin(_cid: CID<unknown, 113, 18, 1>): Promise<void> {
		// No-op: see comment above.
	}

	/**
	 * Provide a CID to the DHT (optional, fire-and-forget).
	 */
	async provide(cid: CID<unknown, 113, 18, 1>): Promise<void> {
		// No-op; provide is typically not allowed in the browser environment.
	}
}
