import { CID } from "../utils/CID.js"

export interface RawEthLog {
	address: string // Contract address
	topics: string[] // Array of 32-byte hex strings
	data: string // Hex string, ABI-encoded data
	blockNumber: number // Block number
	transactionHash: string // Transaction hash
	transactionIndex: number // Transaction index in block
	blockHash: string // Block hash
	logIndex: number // Log index in block
	removed: boolean // True if removed due to reorg
	// Some providers/libraries may add extra fields, but these are standard
}

export interface NormalizedLeafInsertEvent {
	leafIndex: number
	previousInsertBlockNumber: number
	newData: Uint8Array
	// leftInputs: Uint8Array[] // "left hashes" as raw 32-byte hashes (not dag-cbor encoded CIDs).
	leftInputs: CID<unknown, 113, 18, 1>[]
	blockNumber: number
	transactionHash: string
	removed: boolean
}

export interface AccumulatorMetadata {
	peakHeights: number[]
	peakCount: number
	leafCount: number
	previousInsertBlockNumber: number
	deployBlockNumber: number
}

/**
 * Represents a single MMR peak with its CID and height.
 */
export type PeakWithHeight = { cid: CID<unknown, 113, 18, 1>; height: number }

// contains the CID and data for the leaf, all new intermediate nodes, and the new root node
export type MMRLeafInsertTrail = { cid: CID<unknown, 113, 18, 1>; data: Uint8Array }[]

/**
 * Represents all relevant data for a leaf/event in the accumulator.
 */
export type LeafRecord = {
	newData: Uint8Array
	event?: NormalizedLeafInsertEvent
	blockNumber?: number
	rootCid?: CID<unknown, 113, 18, 1>
	peaksWithHeights?: PeakWithHeight[] // This is the set of active peaks of the mmr AFTER this leaf/event is inserted.
	// ...other fields as needed
	[key: string]: unknown // Allow extra properties for type tagging
}

export type CIDDataPair = { cid: CID<unknown, 113, 18, 1>; data: Uint8Array }
