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

/**
 * Recursively resolves a Merkle tree (DAG) from a given root CID using the provided blockstore.
 *
 * This function traverses the DAG in depth-first order, decoding each IPLD node using dag-cbor.
 * It collects and returns all leaf node data (as Uint8Array) in a flat array.
 *
 * If any block referenced by the DAG is missing from the blockstore, the function will throw an Error
 * with a descriptive message indicating which CID could not be found. This behavior is intentional:
 * callers should be prepared to handle thrown errors if the DAG is incomplete or unavailable.
 *
 * @param cid - The root CID of the Merkle tree to resolve. Must be CID.
 * @param blockstore - An object implementing a get(cid) method that returns the raw block data for a CID.
 * @returns Promise<Uint8Array[]> Resolves to an array of all leaf node data found in the DAG.
 * @throws Error if any block is missing or if an unexpected node structure is encountered.
 *
 * @example
 * try {
 *   const leaves = await resolveMerkleTreeOrThrow(rootCid, ipfsBlockstore)
 *   // All leaves are present, do something with them
 * } catch (err) {
 *   // Handle the missing block or DAG structure error
 * }
 */
export async function resolveMerkleTreeOrThrow(
	cid: CID,
	blockstore: { get(cid: CID): Promise<Uint8Array> },
): Promise<Uint8Array[]> {
	let raw: Uint8Array
	try {
		raw = await blockstore.get(cid)
	} catch (e) {
		throw new Error(`Block with CID ${cid.toString()} not found in blockstore`)
	}
	const node: IpldNode = dagCbor.decode(raw)

	if (node instanceof Uint8Array) {
		return [node]
	} else if (isIpldLink(node)) {
		return await resolveMerkleTreeOrThrow(node, blockstore)
	} else if (isInternalNode(node)) {
		const L = await resolveMerkleTreeOrThrow(node.L, blockstore)
		const R = await resolveMerkleTreeOrThrow(node.R, blockstore)
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
