import { Interface } from 'ethers'

export const MINIMAL_ACCUMULATOR_ABI = [
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint32",
				"name": "leafIndex",
				"type": "uint32"
			},
			{
				"indexed": false,
				"internalType": "uint32",
				"name": "previousInsertBlockNumber",
				"type": "uint32"
			},
			{
				"indexed": false,
				"internalType": "bytes",
				"name": "newData",
				"type": "bytes"
			},
			{
				"indexed": false,
				"internalType": "bytes32[]",
				"name": "combineResults",
				"type": "bytes32[]"
			},
			{
				"indexed": false,
				"internalType": "bytes32[]",
				"name": "rightInputs",
				"type": "bytes32[]"
			}
		],
		"name": "LeafInsert",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "getAccumulatorData",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			},
			{
				"internalType": "bytes32[32]",
				"name": "",
				"type": "bytes32[32]"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "getLatestCID",
		"outputs": [
			{
				"internalType": "bytes",
				"name": "",
				"type": "bytes"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
] as const

export const MINIMAL_ACCUMULATOR_INTERFACE = new Interface(MINIMAL_ACCUMULATOR_ABI)
