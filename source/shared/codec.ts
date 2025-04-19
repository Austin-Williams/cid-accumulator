// shared/codec.ts
import { Log } from "ethers"
import { CID } from "multiformats/cid"
import * as dagCbor from "@ipld/dag-cbor"
import { sha256 } from "multiformats/hashes/sha2"
import { MINIMAL_ACCUMULATOR_INTERFACE } from "../shared/constants.ts"
import { NormalizedLeafInsertEvent } from "../shared/types.ts"
import { fromHex } from "multiformats/bytes"

/**
 * Decodes a LeafInsert event log from ethers, normalizing all possible upstream types
 * (bigint, string, number, etc) to a strictly typed LeafInsertEvent output.
 * This ensures downstream code always receives predictable types, regardless of
 * quirks in ABI parsing or provider behavior.
 */
export async function decodeLeafInsert(log: Log): Promise<NormalizedLeafInsertEvent> {
	// ethers parseLog returns LogDescription | null, not our custom type. We check for null, then assert type for strict downstream typing.
	let parsed: any = null
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

	// Strictly parse leafIndex and previousInsertBlockNumber to number
	const leafIndexNum =
		typeof leafIndex === "bigint" ? Number(leafIndex) : typeof leafIndex === "string" ? Number(leafIndex) : leafIndex

	const prevBlockNum =
		typeof previousInsertBlockNumber === "bigint"
			? Number(previousInsertBlockNumber)
			: typeof previousInsertBlockNumber === "string"
				? Number(previousInsertBlockNumber)
				: previousInsertBlockNumber

	// Strictly parse newData to Uint8Array
	let newDataBytes: Uint8Array
	if (typeof newData === "string") {
		if (!newData.startsWith("0x")) throw new Error("newData string must be hex-prefixed")
		newDataBytes = new Uint8Array(Buffer.from(newData.slice(2), "hex"))
	} else {
		newDataBytes = new Uint8Array(newData)
	}

	// Strictly parse leftInputs to CID[]
	if (!Array.isArray(leftInputs)) throw new Error("leftInputs must be an array")
	const leftCids = leftInputs.map((v) => {
		if (typeof v !== "string") throw new Error("leftInputs must be string[]")
		return cidFromBytes32HexString(v)
	})

	return {
		leafIndex: leafIndexNum,
		previousInsertBlockNumber: prevBlockNum,
		newData: newDataBytes,
		leftInputs: await Promise.all(leftCids),
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

// Robust CID construction from raw bytes32-hex-string hashes (assume dag-cbor + sha2-256, CIDv1)
// If your accumulator uses a different codec/hash, update these codes!
export async function cidFromBytes32HexString(bytes32hexString: string): Promise<CID<unknown, 113, 18, 1>> {
	const digest = await sha256.digest(fromHex(bytes32hexString).slice(0, 32))
	return CID.create(1, 0x71, digest) // 0x71 = dag-cbor
}
