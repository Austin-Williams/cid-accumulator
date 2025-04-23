import { CID } from "../../utils/CID.js"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"

/**
 * ReadOnlyIpfsAdapter: Read-only IPFS adapter for fetching blocks via any public gateway.
 * All write operations (put, pin, provide) are no-ops.
 * Pass any gateway base URL (e.g., https://dweb.link/ipfs/, https://ipfs.io/ipfs/).
 */
export class ReadOnlyIpfsAdapter implements IpfsAdapter {
	private gatewayUrl: string

	constructor(gatewayUrl: string = "https://ipfs.io/ipfs/") {
		this.gatewayUrl = gatewayUrl.replace(/\/$/, "") // Remove trailing slash
	}

	/**
	 * Get a block by CID from IPFS via the configured gateway using the /ipfs/<cid> path (CORS-friendly).
	 */
	async get(cid: CID<unknown, 113, 18, 1>): Promise<Uint8Array> {
		// Ensure the gateway URL does not end with a slash
		const base = this.gatewayUrl.replace(/\/+$/, "")
		// Always use the /ipfs/<cid> path
		const url = `${base}/ipfs/${cid.toString()}`
		const res = await fetch(url, { method: "GET" })
		if (!res.ok) throw new Error(`ReadOnlyIpfsAdapter get failed: ${res.status} ${res.statusText}`)
		return new Uint8Array(await res.arrayBuffer())
	}

	/** No-op: public gateways do not support writing blocks. */
	async put(_cid: CID<unknown, 113, 18, 1>, _data: Uint8Array): Promise<void> {
		return
	}
	async pin(_cid: CID<unknown, 113, 18, 1>): Promise<void> {
		return
	}
	async provide(_cid: CID<unknown, 113, 18, 1>): Promise<void> {
		return
	}
}
