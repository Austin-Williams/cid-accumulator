// shared/codec.ts
import { CID } from "multiformats/cid"
import * as dagCbor from "@ipld/dag-cbor"
import { sha256 } from "multiformats/hashes/sha2"
import { CIDDataPair, LeafRecord, NormalizedLeafInsertEvent } from "../types/types.ts"
import { fromHex } from "multiformats/bytes"
import { create as createDigest } from "multiformats/hashes/digest"

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
export async function hexStringToCID(bytes32hexString: string): Promise<CID> {
	const digest = await sha256.digest(fromHex(bytes32hexString).slice(0, 32))
	return CID.create(1, 0x71, digest) // 0x71 = dag-cbor
}

export function CIDTohexString(cid: CID): string {
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
	const digest = createDigest(0x12, bytes) // 0x12 = sha2-256
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
export function PeakWithHeightArrayToString(peaks: { cid: CID; height: number }[]): string {
	return JSON.stringify(peaks.map((p) => ({ cid: CIDTohexString(p.cid), height: p.height })))
}

// Converts a JSON string back to PeakWithHeight[] (cids from hex strings)
export async function StringToPeakWithHeightArray(str: string): Promise<{ cid: CID; height: number }[]> {
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
