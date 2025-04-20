import { keccak_256 } from '@noble/hashes/sha3'

export function getSelector(signature: string): string {
	const hash: Uint8Array = keccak_256(signature)
	const selectorHex = Array.from(hash.slice(0, 4))
		.map(b => b.toString(16).padStart(2, "0"))
		.join("")
	return "0x" + selectorHex
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
	const data = hex.startsWith("0x") ? hex.slice(2) : hex;
	if (data.length < 64 + 32 * 64) throw new Error("Result too short for ABI-encoded tuple");
	const mmrMetaBits = BigInt("0x" + data.slice(0, 64));
	const peaks: Uint8Array[] = [];
	for (let i = 0; i < 32; i++) {
		const start = 64 + i * 64;
		const end = start + 64;
		peaks.push(Buffer.from(data.slice(start, end), "hex"));
	}
	return [mmrMetaBits, peaks];
}