import { CID } from "multiformats/cid"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import type { KuboRPCClient } from "kubo-rpc-client"

/**
 * KuboRpcAdapter implements IpfsAdapter for Node.js using kubo-rpc-client to talk to a local IPFS Desktop node.
 */
export class KuboRpcAdapter implements IpfsAdapter {
	private client: KuboRPCClient
	constructor(client: KuboRPCClient) {
		this.client = client
	}
	async get(cid: CID<unknown, 113, 18, 1>): Promise<Uint8Array> {
		// Kubo block.get returns a Promise<Uint8Array>
		return await this.client.block.get(cid)
	}
	async put(_cid: CID<unknown, 113, 18, 1>, data: Uint8Array): Promise<void> {
		// Kubo block.put does not accept a CID argument, so we must only put the data
		await this.client.block.put(data)
	}
	async pin(_cid: CID<unknown, 113, 18, 1>): Promise<void> {
		await this.client.pin.add(_cid)
	}
	async provide(_cid: CID<unknown, 113, 18, 1>): Promise<void> {
		// Kubo provides pinned blocks automatically, but you can force a DHT provide
		if (this.client.routing && this.client.routing.provide) {
			this.client.routing.provide(_cid, { recursive: true })
		}
	}
}
