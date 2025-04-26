import { IpfsAdapter } from "../interfaces/IpfsAdapter.ts"
import { StorageAdapter } from "../interfaces/StorageAdapter.ts"
import { CID } from "../utils/CID.js"

export interface AccumulatorClientConfig {
	ETHEREUM_HTTP_RPC_URL: string
	ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL: number | undefined
	ETHEREUM_WS_RPC_URL: string | undefined
	CONTRACT_ADDRESS: string
	IPFS_GATEWAY_URL: string
	IPFS_API_URL: string | undefined
	IPFS_PUT_IF_POSSIBLE: boolean
	IPFS_PIN_IF_POSSIBLE: boolean
	IPFS_PROVIDE_IF_POSSIBLE: boolean
	DB_PATH: string | undefined
	GET_LATEST_CID_CALLDATA_OVERRIDE: string | undefined
	GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE: string | undefined
	LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE: string | undefined
}

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
export type MMRLeafInsertTrail = { cid: CID<unknown, 113, 18, 1>; dagCborEncodedData: DagCborEncodedData }[]

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

export type DagCborEncodedData = Uint8Array & { __dagCborEncoded: true }

export type CIDDataPair = { cid: CID<unknown, 113, 18, 1>; dagCborEncodedData: DagCborEncodedData }

export type SyncNamespace = {
	ethereumHttpRpcUrl: string
	ethereumWsRpcUrl: string | undefined
	contractAddress: string
	highestCommittedLeafIndex: number
	lastProcessedBlock: number
	liveSyncRunning: boolean
	liveSyncInterval: ReturnType<typeof setTimeout> | undefined
	websocket: WebSocket | undefined
	newLeafSubscribers: Array<(index: number, data: Uint8Array) => void>
	onNewLeaf: (callback: (index: number, data: string) => void) => () => void
	startSubscriptionSync: () => void
	startPollingSync: () => void
	startLiveSync: () => Promise<void>
	stopLiveSync: () => void
	syncBackwardsFromLatest: () => Promise<void>
}

export type IpfsNamespace = {
	ipfsAdapter: IpfsAdapter
	shouldPut: boolean
	shouldPin: boolean
	shouldProvide: boolean
	getAndResolveCID: (cid: CID<unknown, 113, 18, 1>, opts?: { signal?: AbortSignal }) => Promise<boolean>
	rePinAllDataToIPFS: () => void
	putPinProvideToIPFS: (cid: CID<unknown, 113, 18, 1>, dagCborEncodedData: DagCborEncodedData) => Promise<boolean>
}

export type StorageNamespace = {
	storageAdapter: StorageAdapter
	getLeafRecord: (index: number) => Promise<LeafRecord | null>
	putLeafRecord: (index: number, value: LeafRecord) => Promise<void>
	getHighestContiguousLeafIndexWithData: () => Promise<number>
	getLeafIndexesWithMissingNewData: () => Promise<number[]>
	getCIDDataPairFromDB: (index: number) => Promise<CIDDataPair | null>
	iterateTrailPairs: () => AsyncGenerator<CIDDataPair>
	get: (key: string) => Promise<string | undefined>
	put: (key: string, value: string) => Promise<void>
	delete: (key: string) => Promise<void>
}

export type DataNamespace = {
	getHighestIndex: () => Promise<number>
	getData: (index: number) => Promise<string | undefined>
	getRange: (start: number, end: number) => Promise<Array<{ index: number; data: string }>>
	subscribe: (callback: (index: number, data: string) => void) => () => void
	downloadAll: (prefix: string) => Promise<string>
	iterate: (keyPrefix: string) => AsyncIterable<{ key: string; value: string }>
	createIndexByPayloadSlice: (offset: number, length: number) => Promise<Map<string, string[]>>
}
