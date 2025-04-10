import crypto from 'crypto'

// Compute SHA256 digest of a Buffer.
export function computeSha256(data: Buffer): Buffer {
	return crypto.createHash('sha256').update(data).digest()
}

// Encode a leaf node exactly as in Solidity’s _encodeLeaf.
// Leaf encoding: a1 6176 5820 <32-byte value>
export function encodeLeaf(newValue: Buffer): Buffer {
	return Buffer.concat([
		Buffer.from('a1', 'hex'),
		Buffer.from('6176', 'hex'),
		Buffer.from('5820', 'hex'),
		newValue,
	])
}

// Combine two nodes into an internal node using the fixed CBOR scheme.
// Internal node encoding: a2 614c 5820 <left hash> 6152 5820 <right hash>
export function combineNodes(leftHash: Buffer, rightHash: Buffer): { block: Buffer; hash: Buffer } {
	const block = Buffer.concat([
		Buffer.from('a2', 'hex'),
		Buffer.from('614c', 'hex'),
		Buffer.from('5820', 'hex'),
		leftHash,
		Buffer.from('6152', 'hex'),
		Buffer.from('5820', 'hex'),
		rightHash,
	])
	const hash = computeSha256(block)
	return { block, hash }
}

export function getTestLeaves(numLeaves: number): Buffer[] {
	const leaves: Buffer[] = []
	console.log("\nTest Leaves:\n");
	const hexLeaves: string[] = []
	for (let i = 0; i < numLeaves; i++) {
		const rand = crypto.randomBytes(32)
		leaves.push(rand)
		hexLeaves.push("0x" + rand.toString('hex'))
	}
	// Output the whole array as a single line for copy/paste
	console.log("[" + hexLeaves.map(s => `"${s}"`).join(", ") + "]\n")
	return leaves
}