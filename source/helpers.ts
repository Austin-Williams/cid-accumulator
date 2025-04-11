import crypto from 'crypto'

// Compute SHA256 digest of a Buffer.
export function computeSha256(data: Buffer): Buffer {
	return crypto.createHash('sha256').update(data).digest()
}

export function encodeBytes(data: Buffer): Buffer {
	const len = data.length;
	if (len < 24) {
		// Single byte: 0x40 + len
		return Buffer.concat([Buffer.from([0x40 + len]), data]);
	} else if (len < 256) {
		// 0x58 followed by one byte length.
		return Buffer.concat([Buffer.from('58', 'hex'), Buffer.from([len]), data]);
	} else if (len < 65536) {
		// 0x59 followed by two bytes big-endian.
		const buf = Buffer.alloc(2);
		buf.writeUInt16BE(len, 0);
		return Buffer.concat([Buffer.from('59', 'hex'), buf, data]);
	} else if (len < 4294967296) {
		// 0x5A followed by four bytes big-endian.
		const buf = Buffer.alloc(4);
		buf.writeUInt32BE(len, 0);
		return Buffer.concat([Buffer.from('5A', 'hex'), buf, data]);
	} else {
		throw new Error("Data too large");
	}
}

export function encodeLeaf(newValue: Buffer): Buffer {
	return Buffer.concat([
		Buffer.from('a1', 'hex'),     // CBOR map with one key-value pair.
		Buffer.from('6176', 'hex'),   // Key: "v" encoded as 6176.
		encodeBytes(newValue)         // Value: CBOR-encoded byte string.
	]);
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
	const leaves: Buffer[] = [];
	console.log("\nTest Leaves:\n");
	const hexLeaves: string[] = [];
	for (let i = 0; i < numLeaves; i++) {
		// Pick a random length between 1 and 2048 bytes (inclusive)
		const length = crypto.randomInt(1, 1024); // upper bound is exclusive
		const rand = crypto.randomBytes(length);
		leaves.push(rand);
		hexLeaves.push("0x" + rand.toString("hex"));
	}
	// Output the whole array as a single line for copy/paste
	console.log("[" + hexLeaves.map((s) => `"${s}"`).join(", ") + "]\n");
	return leaves;
}