import { CID } from "multiformats/cid"
import * as dagCbor from "@ipld/dag-cbor"
import { sha256 } from "multiformats/hashes/sha2"

// Encodes a link node as per DagCborCIDEncoder.encodeLinkNode in Solidity
export async function encodeLinkNode(left: CID, right: CID): Promise<CID> {
	// Map(2) { "L": left, "R": right }
	const node = { L: left, R: right }
	const encoded = dagCbor.encode(node)
	const hash = await sha256.digest(encoded)
	return CID.createV1(dagCbor.code, hash)
}
