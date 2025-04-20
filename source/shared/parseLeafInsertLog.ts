import { NormalizedLeafInsertEvent, RawEthLog } from "./types.ts"

// Custom parser for raw LeafInsert logs (no ethers dependency)

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

export function parseLeafInsertLog(log: RawEthLog): NormalizedLeafInsertEvent {
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

	return {
		leafIndex,
		previousInsertBlockNumber,
		newData,
		leftInputs,
		blockNumber: log.blockNumber,
		transactionHash: log.transactionHash,
		removed: log.removed,
	}
}
