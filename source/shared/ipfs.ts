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

export async function resolveMerkleTree(cid: CID, blockstore: IPFSBlockstore): Promise<Uint8Array[]> {
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

export // Minimal Blockstore adapter for kubo-rpc-client
class IPFSBlockstore {
	ipfs: ReturnType<typeof createKuboRPCClient>
	constructor(ipfs: ReturnType<typeof createKuboRPCClient>) {
		this.ipfs = ipfs
	}
	async get(cid: CID): Promise<Uint8Array> {
		return await this.ipfs.block.get(cid)
	}
}
