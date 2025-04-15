import { Log } from 'ethers'
import { CID } from 'multiformats/cid'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'
import { MINIMAL_ACCUMULATOR_INTERFACE } from './constants.ts'
import { LeafInsertEvent } from './types.ts'

export function decodeLeafInsert(log: Log): LeafInsertEvent {
	const parsed = MINIMAL_ACCUMULATOR_INTERFACE.parseLog(log)

	if (!parsed || parsed.name !== 'LeafInsert') {
		throw new Error(`Unexpected or unrecognized log: ${JSON.stringify(log)}`)
	}

	const { leafIndex, previousInsertBlockNumber, newData, combineResults, rightInputs } = parsed.args

	return {
		leafIndex: Number(leafIndex),
		previousInsertBlockNumber: Number(previousInsertBlockNumber),
		newData,
		combineResults,
		rightInputs
	}
}

export async function encodeBlock(value: unknown): Promise<{ cid: CID; bytes: Uint8Array }> {
		const encoded = dagCbor.encode(value)
		const hash = await sha256.digest(encoded)
		const cid = CID.createV1(dagCbor.code, hash)
		return { cid, bytes: encoded }
	}