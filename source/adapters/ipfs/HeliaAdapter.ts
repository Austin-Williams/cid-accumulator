import { CID } from "multiformats/cid"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"

/**
 * HeliaAdapter implements IpfsAdapter for browser/Node Helia usage.
 */
type MinimalBlockAPI = {
	get(cid: CID): Promise<Uint8Array>
	put(cid: CID, data: Uint8Array): Promise<void>
}

export class HeliaAdapter implements IpfsAdapter {
	private block: MinimalBlockAPI
	constructor(block: MinimalBlockAPI) {
		this.block = block
	}
	async get(cid: CID): Promise<Uint8Array> {
		return this.block.get(cid)
	}
	async put(cid: CID, data: Uint8Array): Promise<void> {
		await this.block.put(cid, data)
	}
	async pin(_cid: CID): Promise<void> {
		// Helia auto-provides, pinning is implicit by retention
		// Optionally, you can implement a pin set if needed
	}

	async provide(_cid: CID): Promise<void> {
		// Helia provides all stored blocks automatically to the network.
		// This is a no-op for Helia, but present for interface completeness.
	}
}
