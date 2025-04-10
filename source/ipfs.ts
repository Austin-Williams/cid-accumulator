import { CID } from 'multiformats/cid'
import { computeSha256 } from './helpers.ts'

// Compute the final CID from a given root hash.
// Uses: multihash = <0x12><0x20><root> and then CID = <0x01><0x71><multihash>
export function computeCID(root: Buffer): CID {
	const multihash = Buffer.concat([
		Buffer.from('12', 'hex'), // SHA2-256 function code
		Buffer.from('20', 'hex'), // 32 bytes length
		root,
	])
	const cidBytes = Buffer.concat([
		Buffer.from('01', 'hex'), // CID version 1
		Buffer.from('71', 'hex'), // dag-cbor codec
		multihash,
	])
	return CID.decode(cidBytes)
}

export function computeBlockCID(block: Buffer): CID {
	const blockDigest = computeSha256(block)
	const blockMultihash = Buffer.concat([
		Buffer.from('12', 'hex'),
		Buffer.from('20', 'hex'),
		blockDigest,
	])
	const blockCIDBytes = Buffer.concat([
		Buffer.from('01', 'hex'),
		Buffer.from('71', 'hex'),
		blockMultihash,
	])
	return CID.decode(blockCIDBytes)
}