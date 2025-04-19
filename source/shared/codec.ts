// shared/codec.ts
import { Log } from "ethers"
import { CID } from "multiformats/cid"
import * as dagCbor from "@ipld/dag-cbor"
import { sha256 } from "multiformats/hashes/sha2"
import { MINIMAL_ACCUMULATOR_INTERFACE } from "../shared/constants.ts"
import { LeafInsertEvent } from "../shared/types.ts"

export function decodeLeafInsert(log: Log): LeafInsertEvent {
	let parsed
	try {
		parsed = MINIMAL_ACCUMULATOR_INTERFACE.parseLog(log)
	} catch {
		throw new Error(
			`Unexpected or unrecognized log: address=${log.address}, blockNumber=${log.blockNumber}, topics=${JSON.stringify(log.topics)}`,
		)
	}

	if (!parsed || parsed.name !== "LeafInsert") {
		throw new Error(
			`Unexpected or unrecognized log: address=${log.address}, blockNumber=${log.blockNumber}, topics=${JSON.stringify(log.topics)}`,
		)
	}

	const { leafIndex, previousInsertBlockNumber, newData, leftInputs } = parsed.args

	return {
		leafIndex: Number(leafIndex),
		previousInsertBlockNumber: Number(previousInsertBlockNumber),
		newData:
			typeof newData === "string" && newData.startsWith("0x")
				? new Uint8Array(Buffer.from(newData.slice(2), "hex"))
				: new Uint8Array(newData),
		leftInputs,
	}
}

export async function encodeBlock(value: unknown): Promise<{ cid: CID; bytes: Uint8Array }> {
	const encoded = dagCbor.encode(value)
	const hash = await sha256.digest(encoded)
	const cid = CID.createV1(dagCbor.code, hash)
	return { cid, bytes: encoded }
}

// Encodes a link node as per DagCborCIDEncoder.encodeLinkNode in Solidity
export async function encodeLinkNode(left: CID, right: CID): Promise<CID> {
	// Map(2) { "L": left, "R": right }
	const node = { L: left, R: right }
	const encoded = dagCbor.encode(node)
	const hash = await sha256.digest(encoded)
	return CID.createV1(dagCbor.code, hash)
}
