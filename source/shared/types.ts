// export interface Log {
// 	topics: string[]
// 	data: string
// 	address: string
// 	blockNumber: string
// 	transactionHash: string
// }

export interface LeafInsertEvent {
	leafIndex: number
	previousInsertBlockNumber: number
	newData: Uint8Array
	combineResults: string[]
	rightInputs: string[]
	blockNumber?: number
}

export interface AccumulatorMetadata {
	peakHeights: number[]
	peakCount: number
	leafCount: number
	previousInsertBlockNumber: number
	deployBlockNumber: number
}
