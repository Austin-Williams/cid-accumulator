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
	async get(cid: CID): Promise<Uint8Array> {
		// Kubo block.get returns a Promise<Uint8Array>
		return await this.client.block.get(cid)
	}
	async put(_cid: CID, data: Uint8Array): Promise<void> {
		// Kubo block.put does not accept a CID argument, so we must only put the data
		await this.client.block.put(data, { format: "dag-cbor", mhtype: "sha2-256", pin: true })
	}
	async pin(_cid: CID): Promise<void> {
		return // Kubo automatically pins during the put
	}
	async provide(cid: CID): Promise<void> {
		// Kubo provides pinned blocks automatically, but you can force a DHT provide
		if (this.client.routing && this.client.routing.provide) {
			// Fire and forget: do not block on the async iterable
			void this.client.routing.provide(cid, { recursive: true })
		}
	}
}
