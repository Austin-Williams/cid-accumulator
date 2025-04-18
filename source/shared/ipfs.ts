import * as dagCbor from "@ipld/dag-cbor"
import { CID } from "multiformats/cid"
import { createKuboRPCClient } from "kubo-rpc-client"

export type IpldNode = Uint8Array | CID | { L: CID; R: CID }

function isIpldLink(obj: unknown): obj is CID {
	return obj instanceof CID
}

function isInternalNode(obj: unknown): obj is { L: CID; R: CID } {
	return (
		typeof obj === "object" &&
		obj !== null &&
		"L" in obj &&
		"R" in obj &&
		(obj as any).L instanceof CID &&
		(obj as any).R instanceof CID
	)
}

export async function resolveMerkleTree(cid: CID, blockstore: { get(cid: CID): Promise<Uint8Array> }): Promise<Uint8Array[]> {
	const raw = await blockstore.get(cid)
	const node: IpldNode = dagCbor.decode(raw)

	if (node instanceof Uint8Array) {
		return [node]
	} else if (isIpldLink(node)) {
		return await resolveMerkleTree(node, blockstore)
	} else if (isInternalNode(node)) {
		const L = await resolveMerkleTree(node.L, blockstore)
		const R = await resolveMerkleTree(node.R, blockstore)
		return [...L, ...R]
	} else {
		throw new Error("Unexpected node structure")
	}
}

 // Minimal Blockstore adapter for kubo-rpc-client
export class IPFSBlockstore {
	ipfs: ReturnType<typeof createKuboRPCClient>
	constructor(ipfs: ReturnType<typeof createKuboRPCClient>) {
		this.ipfs = ipfs
	}
	async get(cid: CID): Promise<Uint8Array> {
		return await this.ipfs.block.get(cid)
	}
}

// Minimal Blockstore adapter for public IPFS gateway (e.g. gatewayBase=https://dweb.link)
export class PublicGatewayBlockstore {
	gatewayBase: string
	constructor(gatewayBase: string) {
		this.gatewayBase = gatewayBase.replace(/\/$/, "")
	}
	async get(cid: CID): Promise<Uint8Array> {
		const url = `${this.gatewayBase}/ipfs/${cid.toString()}`
		const res = await fetch(url)
		if (!res.ok) {
			throw new Error(`Failed to fetch block ${cid} from gateway: ${res.status} ${res.statusText}`)
		}
		const buf = new Uint8Array(await res.arrayBuffer())
		return buf
	}
}