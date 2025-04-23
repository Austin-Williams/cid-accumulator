import * as dagCbor from "../utils/dagCbor.ts"
import { CID } from "../utils/CID.js"
import { IpfsAdapter } from "../interfaces/IpfsAdapter.ts"
import type { DagCborEncodedData } from "../types/types.ts"

export type IpldNode =
	| Uint8Array
	| CID<unknown, 113, 18, 1>
	| { L: CID<unknown, 113, 18, 1>; R: CID<unknown, 113, 18, 1> }

function isIpldLink(obj: unknown): obj is CID<unknown, 113, 18, 1> {
	return obj instanceof CID
}

function isInternalNode(obj: unknown): obj is { L: CID<unknown, 113, 18, 1>; R: CID<unknown, 113, 18, 1> } {
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
	cid: CID<unknown, 113, 18, 1>,
	blockstore: IpfsAdapter,
): Promise<Uint8Array[]> {
	let raw: DagCborEncodedData
	try {
		raw = await blockstore.getBlock(cid)
	} catch {
		throw new Error(`Block with CID ${cid.toString()} not found in blockstore`)
	}
	const node: IpldNode = dagCbor.decode(raw) // you either get (NOT DagCbor encoded) leaf data, a leaf's CID, or a (NOT DagCbor encoded) link node

	if (node instanceof Uint8Array) {
		// then we just got a leaf
		return [node] // return the leaf
	} else if (isIpldLink(node)) {
		// then we just got a leaf's CID
		return await resolveMerkleTreeOrThrow(node, blockstore) // resolve the leaf's CID to the (NOT DagCbor encoded) leaf data
	} else if (isInternalNode(node)) {
		// then we just got a (NOT DagCbor encoded) link node that points to a "left" CID and a "right" CID
		const L = await resolveMerkleTreeOrThrow(node.L, blockstore)
		const R = await resolveMerkleTreeOrThrow(node.R, blockstore)
		return [...L, ...R]
	} else {
		throw new Error("Unexpected node structure")
	}
}
