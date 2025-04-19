import { CID } from "multiformats/cid"

export interface NormalizedLeafInsertEvent {
	leafIndex: number
	previousInsertBlockNumber: number
	newData: Uint8Array
	leftInputs: CID[]
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
export type PeakWithHeight = { cid: CID; height: number }

/**
 * Represents all relevant data for a leaf/event in the accumulator.
 */
export type LeafRecord = {
	event: any // Replace with actual EventData type
	blockNumber: number
	rootCid?: CID
	peaksWithHeights: PeakWithHeight[]
	// ...other fields as needed
}

/**
 * Represents a DAG node (leaf or link) in the accumulator.
 */
export type DagNodeRecord = {
	cid: CID // or CID type
	data: Uint8Array
	type: "leaf" | "link"
	leafIndex?: number
	// ...other fields as needed (e.g., children, parent, height)
}
