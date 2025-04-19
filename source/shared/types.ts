import { CID } from "multiformats/cid"

export interface NormalizedLeafInsertEvent {
	leafIndex: number
	previousInsertBlockNumber: number
	newData: Uint8Array
	leftInputs: CID<unknown, 113, 18, 1>[]
	blockNumber?: number
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

/**
 * Represents all relevant data for a leaf/event in the accumulator.
 */
export type LeafRecord = {
	newData: Uint8Array
	event?: NormalizedLeafInsertEvent
	blockNumber?: number
	rootCid?: CID<unknown, 113, 18, 1>
	peaksWithHeights?: PeakWithHeight[]
	// ...other fields as needed
}

/**
 * Represents a DAG node (leaf or link) in the accumulator.
 */
export type DagNodeRecord = {
	cid: CID<unknown, 113, 18, 1>
	data: Uint8Array
	type: "leaf" | "link"
	leafIndex?: number
	// ...other fields as needed (e.g., children, parent, height)
}
