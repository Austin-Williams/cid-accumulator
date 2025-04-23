import * as dagCbor from "./dagCbor.ts"
import { DagCborEncodedData } from "../types/types.ts";
import { hashToMultiformatsDigest } from "./codec.ts"
import { CID } from "./CID.ts"
import { sha256 } from "./hash.ts"

export async function verifyCIDAgainstDagCborEncodedData(dagCborEncodedData: DagCborEncodedData, expectedCID: CID<unknown, 113, 18, 1>): Promise<boolean> {
	const hash = await sha256(dagCborEncodedData)
	const multihash = hashToMultiformatsDigest(0x12, hash) // 0x12 is the code for sha2-256
	const computedCID = CID.createV1(dagCbor.code, multihash)
	return computedCID.toString() === expectedCID.toString()
}

export async function verifyCIDAgainstDagCborEncodedDataOrThrow(dagCborEncodedData: DagCborEncodedData, expectedCID: CID<unknown, 113, 18, 1>, errorMessage?: string): Promise<void> {
	const hash = await sha256(dagCborEncodedData)
	const multihash = hashToMultiformatsDigest(0x12, hash) // 0x12 is the code for sha2-256
	const computedCID = CID.createV1(dagCbor.code, multihash)
	const message: string = errorMessage ?? `[Accumulator] 💥 CID/Data pair is invalid. dagCborEncodedData: ${dagCborEncodedData}, expectedCID: ${expectedCID.toString()}, computed(actual)CID: ${computedCID.toString()}`
	if (computedCID.toString() !== expectedCID.toString()) throw new Error(message)
}

export async function verifyCIDAgainstRawUnencodedEncodedData(rawUnencodedData: Uint8Array, expectedCID: CID<unknown, 113, 18, 1>): Promise<boolean> {
	const encodedData: DagCborEncodedData = dagCbor.encode(rawUnencodedData)
	const hash = await sha256(encodedData)
	const multihash = hashToMultiformatsDigest(0x12, hash) // 0x12 is the code for sha2-256
	const computedCID = CID.createV1(dagCbor.code, multihash)
	return computedCID.toString() !== expectedCID.toString()
}

export async function verifyCIDAgainstRawUnencodedEncodedDataOrThrow(rawUnencodedData: Uint8Array, expectedCID: CID<unknown, 113, 18, 1>, errorMessage?: string): Promise<void> {
	const encodedData: DagCborEncodedData = dagCbor.encode(rawUnencodedData)
	const hash = await sha256(encodedData)
	const multihash = hashToMultiformatsDigest(0x12, hash) // 0x12 is the code for sha2-256
	const computedCID = CID.createV1(dagCbor.code, multihash)
	const message: string = errorMessage ?? `[Accumulator] 💥 CID/Data pair is invalid. rawUnencodedData: ${rawUnencodedData}, ExpectedCID: ${expectedCID.toString()}, ActualCID: ${computedCID.toString()}`
	if (computedCID.toString() !== expectedCID.toString()) throw new Error(message)
}