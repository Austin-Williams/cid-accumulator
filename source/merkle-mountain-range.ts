import { Buffer } from 'buffer'
import { computeSha256, encodeLeaf, combineNodes } from './helpers.ts'

export interface MMRNode {
	hash: Buffer    // 32-byte digest
	height: number  // 0 for leaves; >0 for internal nodes
	block: Buffer   // The CBOR-encoded block for this node
}

// Build the MMR from an array of leaves (each a 32-byte Buffer).
// Returns the final (aggregated) root digest and a Map of all blocks to be uploaded.
// Blocks are keyed by their hex string digest.
export async function buildMMR(leaves: Buffer[]): Promise<{ finalRoot: Buffer; blocks: Map<string, Buffer> }> {
	const blocks = new Map<string, Buffer>()
	const peaks: MMRNode[] = []

	for (const leafValue of leaves) {
		// Encode leaf and compute its digest.
		const leafBlock = encodeLeaf(leafValue)
		const leafHash = computeSha256(leafBlock)
		blocks.set(leafHash.toString('hex'), leafBlock)

		// Create a new leaf node.
		let carry: MMRNode = { hash: leafHash, height: 0, block: leafBlock }

		// While there is a peak with the same height, merge them.
		while (peaks.length > 0 && peaks[peaks.length - 1].height === carry.height) {
			const leftNode = peaks.pop()!
			const { block, hash } = combineNodes(leftNode.hash, carry.hash)
			blocks.set(hash.toString('hex'), block)
			carry = { hash, height: carry.height + 1, block }
		}
		peaks.push(carry)
	}

	// Bag the peaks: sequentially combine to a single root.
	let root = peaks[0].hash
	for (let i = 1; i < peaks.length; i++) {
		const { block, hash } = combineNodes(root, peaks[i].hash)
		blocks.set(hash.toString('hex'), block)
		root = hash
	}

	return { finalRoot: root, blocks }
}