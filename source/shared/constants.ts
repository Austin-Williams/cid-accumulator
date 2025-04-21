import { CID } from "multiformats/cid"

export const MINIMAL_ACCUMULATOR_ABI = [
	{
		name: "LeafInsert",
		type: "event",
		anonymous: false,
		inputs: [
			{
				name: "leafIndex",
				type: "uint32",
				indexed: true,
				internalType: "uint32",
			},
			{
				name: "previousInsertBlockNumber",
				type: "uint32",
				indexed: false,
				internalType: "uint32",
			},
			{
				name: "newData",
				type: "bytes",
				indexed: false,
				internalType: "bytes",
			},
			{
				name: "leftInputs",
				type: "bytes32[]",
				indexed: false,
				internalType: "bytes32[]",
			},
		],
	},
	{
		name: "getAccumulatorData",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "uint256",
				internalType: "uint256",
			},
			{
				name: "",
				type: "bytes32[32]",
				internalType: "bytes32[32]",
			},
		],
	},
	{
		name: "getLatestCID",
		type: "function",
		stateMutability: "view",
		inputs: [],
		outputs: [
			{
				name: "",
				type: "bytes",
				internalType: "bytes",
			},
		],
	},
] as const

export const EMPTY_CID: CID = CID.parse("bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku")
