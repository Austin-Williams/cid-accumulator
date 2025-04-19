export interface LeafInsertEvent {
	leafIndex: number
	previousInsertBlockNumber: number
	newData: Uint8Array
	leftInputs: string[]
	blockNumber?: number
}

export interface AccumulatorMetadata {
	peakHeights: number[]
	peakCount: number
	leafCount: number
	previousInsertBlockNumber: number
	deployBlockNumber: number
}
