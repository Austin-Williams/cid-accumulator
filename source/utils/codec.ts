// shared/codec.ts
import { createHash } from "crypto"
import * as dagCbor from "./dagCbor.ts"
import { CID } from "./CID.js"

import { CIDDataPair, LeafRecord, NormalizedLeafInsertEvent } from "../types/types.ts"

interface Digest<Code, Size extends number = number> {
	code: Code // hash function code (e.g., 0x12 for sha2-256)
	digest: Uint8Array // the actual hash digest bytes
	size: Size // length of the digest in bytes
	bytes: Uint8Array // the full multihash bytes (code + length + digest)
}

function hashToMultiformatsDigest(code: 0x12, hash: Uint8Array): Digest<0x12, 32> {
	// Multihash format: [code, length, ...digest]
	const bytes = new Uint8Array([code, hash.length, ...hash])
	return { code, digest: hash, size: 32, bytes }
}

export async function encodeBlock(value: unknown): Promise<{ cid: CID<unknown, 113, 18, 1>; bytes: Uint8Array }> {
	const encoded = dagCbor.encode(value)
	const hash = new Uint8Array(createHash("sha256").update(encoded).digest())
	const multihash = hashToMultiformatsDigest(0x12, hash) // 0x12 is the code for sha2-256
	const cid = CID.createV1(dagCbor.code, multihash)
	return { cid, bytes: encoded }
}

// Encodes a link node as per DagCborCIDEncoder.encodeLinkNode in Solidity
export async function encodeLinkNode(
	left: CID<unknown, 113, 18, 1>,
	right: CID<unknown, 113, 18, 1>,
): Promise<CID<unknown, 113, 18, 1>> {
	// Map(2) { "L": left, "R": right }
	const node = { L: left, R: right }
	const encoded = dagCbor.encode(node)
	const hash = new Uint8Array(createHash("sha256").update(encoded).digest())
	const multihash = hashToMultiformatsDigest(0x12, hash) // 0x12 is the code for sha2-256
	return CID.createV1(dagCbor.code, multihash)
}

// Robust CID construction from raw bytes32-hex-string hashes (assume dag-cbor + sha2-256, CIDv1)
// If your accumulator uses a different codec/hash, update these codes!
export async function hexStringToCID(bytes32hexString: string): Promise<CID<unknown, 113, 18, 1>> {
	const hash = new Uint8Array(
		createHash("sha256").update(HexStringToUint8Array(bytes32hexString).slice(0, 32)).digest(),
	)
	const multihash = hashToMultiformatsDigest(0x12, hash) // 0x12 is the code for sha2-256
	return CID.createV1(0x71, multihash) // 0x71 = dag-cbor
}

export function CIDTohexString(cid: CID<unknown, 113, 18, 1>): string {
	// Only support dag-cbor + sha2-256, CIDv1
	if (cid.version !== 1) {
		console.error("[CIDTohexString] CID version mismatch:", {
			cid: cid.toString(),
			version: cid.version,
			code: cid.code,
			multihashCode: cid.multihash.code,
		})
		throw new Error("Only CIDv1 supported")
	}
	if (cid.code !== 0x71) {
		console.error("[CIDTohexString] CID codec mismatch:", {
			cid: cid.toString(),
			version: cid.version,
			code: cid.code,
			multihashCode: cid.multihash.code,
		})
		throw new Error("Only dag-cbor supported")
	}
	if (cid.multihash.code !== 0x12) {
		console.error("[CIDTohexString] Multihash code mismatch:", {
			cid: cid.toString(),
			version: cid.version,
			code: cid.code,
			multihashCode: cid.multihash.code,
		})
		throw new Error("Only sha2-256 supported")
	}
	const digestBytes = cid.multihash.digest
	if (digestBytes.length !== 32) {
		console.error("[CIDTohexString] Digest length mismatch:", {
			cid: cid.toString(),
			version: cid.version,
			code: cid.code,
			multihashCode: cid.multihash.code,
			digestLength: digestBytes.length,
		})
		throw new Error("Digest must be 32 bytes")
	}
	return Uint8ArrayToHexString(digestBytes)
}

export function CIDDataPairToString(pair: CIDDataPair): string {
	return JSON.stringify({ cid: CIDTohexString(pair.cid), data: Uint8ArrayToHexString(pair.data) })
}

export async function stringToCIDDataPair(s: string): Promise<CIDDataPair> {
	const { cid, data } = JSON.parse(s)
	return { cid: await hexStringToCID(cid), data: HexStringToUint8Array(data) }
}

// Convert contract peak hex (digest) to the exact CID form used by mmr.peaks (wrap digest, do not hash)
export function contractPeakHexToMmrCid(bytes: Uint8Array) {
	const digest = hashToMultiformatsDigest(0x12, bytes) // 0x12 = sha2-256
	return CID.create(1, 0x71, digest) // 0x71 = dag-cbor
}

// Converts a Uint8Array to a lowercase hex string (no 0x prefix).
export function Uint8ArrayToHexString(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

// Converts a hex string (with or without 0x prefix) to a Uint8Array.
export function HexStringToUint8Array(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex
	if (clean.length % 2 !== 0) throw new Error("Hex string must have even length")
	const bytes = new Uint8Array(clean.length / 2)
	for (let i = 0; i < clean.length; i += 2) {
		bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
	}
	return bytes
}

// Converts a NormalizedLeafInsertEvent to a JSON string (serializes newData and leftInputs)
export function NormalizedLeafInsertEventToString(event: NormalizedLeafInsertEvent): string {
	return JSON.stringify({
		leafIndex: event.leafIndex,
		previousInsertBlockNumber: event.previousInsertBlockNumber,
		newData: Uint8ArrayToHexString(event.newData),
		leftInputs: event.leftInputs.map((cid) => cid.toString()),
		blockNumber: event.blockNumber,
		transactionHash: event.transactionHash,
		removed: event.removed,
	})
}

// Converts PeakWithHeight[] to a JSON string with cids as hex strings
export function PeakWithHeightArrayToString(peaks: { cid: CID<unknown, 113, 18, 1>; height: number }[]): string {
	return JSON.stringify(peaks.map((p) => ({ cid: CIDTohexString(p.cid), height: p.height })))
}

// Converts a JSON string back to PeakWithHeight[] (cids from hex strings)
export async function StringToPeakWithHeightArray(
	str: string,
): Promise<{ cid: CID<unknown, 113, 18, 1>; height: number }[]> {
	const arr = JSON.parse(str)
	return Promise.all(
		arr.map(async (p: { cid: string; height: number }) => ({ cid: await hexStringToCID(p.cid), height: p.height })),
	)
}

// Converts a JSON string back to a NormalizedLeafInsertEvent (parses newData and leftInputs)
export function StringToNormalizedLeafInsertEvent(str: string): NormalizedLeafInsertEvent {
	const obj = JSON.parse(str)
	return {
		leafIndex: obj.leafIndex,
		previousInsertBlockNumber: obj.previousInsertBlockNumber,
		newData: HexStringToUint8Array(obj.newData),
		leftInputs: obj.leftInputs.map((cidStr: string) => CID.parse(cidStr)),
		blockNumber: obj.blockNumber,
		transactionHash: obj.transactionHash,
		removed: obj.removed,
	}
}

export function getLeafRecordFromNormalizedLeafInsertEvent(event: NormalizedLeafInsertEvent): LeafRecord {
	return {
		newData: event.newData,
		event,
		blockNumber: event.blockNumber,
	}
}
