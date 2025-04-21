import { keccak_256 } from "@noble/hashes/sha3"
import { AccumulatorMetadata, RawEthLog, NormalizedLeafInsertEvent } from "../types/types.ts"
import { contractPeakHexToMmrCid } from "../utils/codec.ts"
import { CID } from "multiformats/cid"

export function getSelector(signature: string): string {
	const hash: Uint8Array = keccak_256(signature)
	const selectorHex = Array.from(hash.slice(0, 4))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
	return "0x" + selectorHex
}

export function getEventTopic(signature: string): string {
	const hash: Uint8Array = keccak_256(signature)
	return (
		"0x" +
		Array.from(hash)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("")
	)
}

/**
 * Parses the ABI-encoded result of a contract call to getLatestCID() -> bytes.
 * This does NOT use ethers/abi, just raw buffer parsing.
 * @param abiResult string (0x-prefixed hex string)
 * @returns Buffer (decoded bytes)
 */
export function parseGetLatestCIDResult(abiResult: string): Buffer {
	// ABI encoding for bytes: 32 bytes offset, then 32 bytes length, then data
	const buf = Buffer.from(abiResult.startsWith("0x") ? abiResult.slice(2) : abiResult, "hex")
	if (buf.length < 64) throw new Error("Result too short for ABI-encoded bytes")
	const len = buf.readUInt32BE(60)
	if (buf.length < 64 + len) throw new Error("Result too short for declared length")
	return buf.slice(64, 64 + len)
}

export function parseGetAccumulatorDataResult(hex: string): [bigint, Uint8Array[]] {
	const data = hex.startsWith("0x") ? hex.slice(2) : hex
	if (data.length < 64 + 32 * 64) throw new Error("Result too short for ABI-encoded tuple")
	const mmrMetaBits = BigInt("0x" + data.slice(0, 64))
	const peaks: Uint8Array[] = []
	for (let i = 0; i < 32; i++) {
		const start = 64 + i * 64
		const end = start + 64
		peaks.push(Buffer.from(data.slice(start, end), "hex"))
	}
	return [mmrMetaBits, peaks]
}

export function parseAccumulatorMetaBits(mmrMetaBits: bigint): AccumulatorMetadata {
	const bits = mmrMetaBits
	const peakHeights: number[] = []
	for (let i = 0; i < 32; i++) {
		peakHeights.push(Number((bits >> BigInt(i * 5)) & 0x1fn))
	}
	const peakCount = Number((bits >> 160n) & 0x1fn)
	const leafCount = Number((bits >> 165n) & 0xffffffffn)
	const previousInsertBlockNumber = Number((bits >> 197n) & 0xffffffffn)
	const deployBlockNumber = Number((bits >> 229n) & 0x7ffffffn)

	return {
		peakHeights,
		peakCount,
		leafCount,
		previousInsertBlockNumber,
		deployBlockNumber,
	}
}

// Helper for robust hex to Uint8Array conversion
export function hexStringToUint8Array(hex: string): Uint8Array {
	if (hex.startsWith("0x")) hex = hex.slice(2)
	if (hex.length % 2 !== 0) hex = "0" + hex
	const bytes = new Uint8Array(hex.length / 2)
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
	}
	return bytes
}

export async function parseLeafInsertLog(log: RawEthLog): Promise<NormalizedLeafInsertEvent> {
	// Helper to parse a 32-byte hex as uint32 (big-endian)
	function parseUint32FromTopic(topic: string): number {
		return parseInt(topic.slice(-8), 16) // last 4 bytes
	}

	const leafIndex = parseUint32FromTopic(log.topics[1])

	// Data field parsing
	const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data

	// previousInsertBlockNumber: first 32 bytes (offset 0)
	const previousInsertBlockNumber = parseInt(data.slice(56, 64), 16)

	// Offsets for dynamic fields (newData, leftInputs)
	const newDataOffset = parseInt(data.slice(64, 128), 16) * 2
	const leftInputsOffset = parseInt(data.slice(128, 192), 16) * 2

	// newData: at newDataOffset, first 32 bytes = length, then bytes
	const newDataLen = parseInt(data.slice(newDataOffset, newDataOffset + 64), 16)
	const newDataHex = data.slice(newDataOffset + 64, newDataOffset + 64 + newDataLen * 2)
	const newData = Uint8Array.from(Buffer.from(newDataHex, "hex"))

	// leftInputs: at leftInputsOffset, first 32 bytes = length, then array of bytes32
	const leftInputsLen = parseInt(data.slice(leftInputsOffset, leftInputsOffset + 64), 16)
	const leftInputs: Uint8Array[] = []
	let leftInputsCursor = leftInputsOffset + 64
	for (let i = 0; i < leftInputsLen; i++) {
		const hexStr = data.slice(leftInputsCursor, leftInputsCursor + 64)
		leftInputs.push(hexStringToUint8Array(hexStr))
		leftInputsCursor += 64
	}
	const leftInputsAsCIDs: CID[] = await Promise.all(leftInputs.map(async (input) => contractPeakHexToMmrCid(input)))

	return {
		leafIndex,
		previousInsertBlockNumber,
		newData,
		leftInputs: leftInputsAsCIDs,
		blockNumber: log.blockNumber,
		transactionHash: log.transactionHash,
		removed: log.removed,
	}
}
