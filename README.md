# cid-accumulator

> ⚠️ **Warning:** This project is unaudited and has not been thoroughly tested.

## Table of Contents
- [What it does](#what-it-does)
- [Why we need it](#why-we-need-it)
- [How to use the smart contract](#how-to-use-the-smart-contract)
- [How the off-chain component works](#how-the-off-chain-component-works)
- [The Accumulator Client](#the-accumulator-client)
- [How to use the AccumulatorClient in your project](#how-to-use-the-accumulatorclient-in-your-project)
  - [Installation](#installation)
  - [Configure and start the client](#configure-and-start-the-client)
  - [Wait for client to sync](#wait-for-client-to-sync)
  - [Accessing data](#accessing-data)
  - [Stopping Live Sync](#stopping-live-sync)
  - [Shutting down](#shutting-down)
  - [Config Options](#config-options)
- [Gas Costs](#gas-costs)

## What it does

- Trustlessly computes and stores an IPFS CID on-chain that represents **all emitted event data**
- Computes the CID incrementally as new data is added
- Allows users to fetch the full dataset from IPFS using a single `getLatestCID()` call

## Why we need it

Apps often emit on-chain events that users need later — like deposit events, offers, or market data. But querying and reconstructing large event logs is inefficient, especially for users on free-tier RPCs.

Too often, app developers rely on centralized services to provide the data directly to their users. This has two serious problems. First, if the centralized service goes offline, the users can't use the app because they can't get the data. Second, while the users could _in principle_ verify the data they get against the blockchain, _in practice_ they can't because that requires running their own node or using a paid-tier RPC provider. So data verifiability is inaccessible to most users of centralized data providers.

Storing the data on IPFS solves the first problem -- it lets users get the data they need even when the centralized service goes offline. All they need it the IPFS CID (Content Identifier) for the data. But it does not solve the second problem -- how do users get and verify the CID they need without having to trust anyone?

This contract, the `CIDAccumulator`, solves that by having _the smart contract itself_ compute and store an IPFS CID that points to a file containing all data ever emitted by the contract. The contract maintains this CID as an accumulator. Users can fetch everything they need directly from IPFS, with full trust in the data’s integrity — because _the smart contract itself_ computed the CID.

## How to use the smart contract

Have your contract inherit from the `CIDAccumulator` contract.

```solidity
contract Example is CIDAccumulator {
    function addData(bytes calldata newData) external {
        _addData(newData);
    }
}
```

Your contract can then call `_addData` with any `bytes` payload you'd like to include in the accumulator. The data will be inserted and the CID will be updated.

> ℹ️ Most inserts fall in the 12.8k - 23.5k gas range for execution. See below for more about gas costs.

## How the off-chain component works

The client-side UI can then call `getLatestCID()` to retrieve the IPFS CID of the file that includes all data added so far. But what if that CID is not available on IPFS?

The `CIDAccumulator` is designed so that you can efficiently compute the _previous_ CID from the current CID + the small amount of data that was emitted by the contract during the last data insert. This allows you to efficiently "walkback" from the current CID through previous CIDs until you find one that is available on IPFS.

A nice feature of this CID-walkback is that, once you find an older CID that is available on IPFS, you'll have already collected all the data between it and the current CID (because you gathered it as you "walked back"). So you'll be fully synced!

(In the worst case, if you never find any of the CIDs on IPFS, you'll eventually walk all the way back to the contract deployent block. If that happens you'll have fully synced using event data alone -- with no help from IPFS.)

This is all handled by a light-weight `AccumulatorClient`.

## The Accumulator Client

The `AccumulatorClient` is a light-weight universal JS/TS class that:
- Collects and verifies all historical contract data using IPFS (and filling in gaps with contract event data wherever needed) using the walkback method described above.
- Stores the data in a local database (IndexedDB in the browser, or as a JSON file in Nodejs).
- Monitors the chain for new data inserts and stores them as they happen.
- (Optionally) Pins and provides (advertises) the data on IPFS.

The `AccumulatorClient` can be used directly in your front end code, or kept running long term in a NodeJs environment to ensure the data remains pinned and available for everyone.

## How to use the AccumulatorClient in your project

### Installation

```bash
npm install cid-accumulator-client
```

### Configure and start the client:

```typescript
import type { AccumulatorClientConfig } from "cid-accumulator-client"
import { AccumulatorClient } from "cid-accumulator-client"

// Set your configuration options
const config: AccumulatorClientConfig = {...YourConfigOptions...}

// Instantiate the client
const client = new AccumulatorClient("0xYourContractAddress", config)

// Start the client
await client.start()
```

### Wait for client to sync

You'll see verbose logs in the console showing syncing progress.

```bash
[Client] 🚀 Starting AccumulatorClient...
[Client] 📤 Found 0 leafs in DB
[Client] 👀 Checking IPFS Gateway connection...
[Client] 🔗 Connected to IPFS Gateway.
[Client] 👀 Checking IPFS API connection (attempting to PUT a block)...
[Client] 🔗 Connected to IPFS API and verified it can PUT blocks.
[Client] 👀 Checking if IPFS API can provide (advertise) blocks...
[Client] 🔗 Connected to IPFS API and verified it can PROVIDE blocks.
[Client] 📜 IPFS Capability Summary:
[Client] 📜 Summary: IPFS Gateway connected: YES
[Client] 📜 Summary: IPFS API PUT is set up: YES
[Client] 📜 Summary: IPFS API PIN is set up: YES
[Client] 📜 Summary: IPFS API PROVIDE is set up: YES
[Client] 👀 Checking Ethereum connection...
[Client] 🔗 Connected to Ethereum. Target contract address: <0xYOUR_CONTRACT_ADDRESS>
[Client] 🔁 Syncing backwards from block 8200764 to block 8147142 (53622 blocks), grabbing 1000 blocks per RPC call.
[Client] 🔎 Simultaneously checking IPFS for older root CIDs as we discover them.
[Client] 📦 Checking blocks 8199765 to 8200764 for LeafInsert events...
[Client] 🍃 Found 7 LeafInsert events
[Client] 📦 Checking blocks 8198765 to 8199764 for LeafInsert events...
[Client] 🍃 Found 5 LeafInsert events
[Client] 📦 Checking blocks 8197765 to 8198764 for LeafInsert events...
...
[Client] 📥 Downloaded all data for root CID bafyreid...n5kpy74e from IPFS.
[Client] 🙌 Successfully resolved all remaining data from IPFS!
[Client] 🌲 Your accumulator client has acquired all data!
[Client] ⛰️ Rebuilding the Merkle Mountain Range from synced leaves and pinning to IPFS. (This can take a while)...
[Client] 🎉 Finished rebuilding the Merkle Mountain Range.
[Client] 👎 No ETHEREUM_WS_RPC_URL provided, will use polling.
[Client] 👀 Using HTTP polling to monitor the chain for new data insertions.
[Client] 🟢 Client is ready to use.
```

When you see `[Client] 🟢 Client is ready to use.` you're ready to access data.

### Accessing data

```typescript
// See how many items have been inserted into the accumulator
const count = await client.data.getHighestIndex()

// Access the ith data that was inserted into the accumulator
const data = await client.data.getData(i)

// Get a range of data by insertion index
const range = await client.data.getRange(start, end) // Returns array of { index: number; data: string }

// Subscribe to new data as it is inserted
const unsubscribe = client.data.subscribe((index, data) => {
	console.log(`New data inserted at index ${index}: ${data}`)
})
// Call unsubscribe() when you're done

// Iterate over all data
for await (const { key, value } of client.data.iterate()) {
	console.log(`Key: ${key}, Value: ${value}`)
}

// Index by data payload slice
const index = await client.data.createIndexByPayloadSlice(offset, length)
const matches = await index.get("someSlice") // Returns array of data (strings) that match the slice

// Download all data to a JSON file (saves to `accumulator-data-${Date.now()}.json` in Nodejs; triggers download prompt in browser)
const filePath = await client.data.downloadAll()

```

### Stopping Live Sync

```typescript
// To stop listening for new data
client.sync.stopLiveSync()
```

### Shutting down

```typescript
// To shut down the client gracefully (unsubscribe from websockets, close DB connection, etc.)
await client.shutdown()
```

### Config Options

```typescript
export const defaultConfig: AccumulatorClientConfig = {
	// The Ethereum HTTP RPC endpoint to use for contract calls and syncing.
	// Should be a full URL to a node that supports the desired network (e.g., mainnet, testnet).
	ETHEREUM_HTTP_RPC_URL: "https://ethereum-rpc.publicnode.com",

	// (Optional) Maximum block range to request per HTTP RPC call when syncing events.
	// Set to undefined to use the default (1000 blocks).
	ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL: undefined,

	// (Optional) Ethereum WebSocket RPC endpoint for real-time event subscriptions.
	// If undefined, will fall back to HTTP RPC polling.
	ETHEREUM_WS_RPC_URL: undefined,

	// The IPFS gateway URL for retrieving content-addressed data (CIDs).
	// Used for fetching data from IPFS when not available locally.
	// You MUST use a *verifiable* IPFS gateway (e.g.,https://dweb.link). See 
	// https://ipfs.github.io/public-gateway-checker/ and look for the ✅ in the "Verifiable" column.
	IPFS_GATEWAY_URL: "https://dweb.link", // http://127.0.0.1:8080 if you have a local IPFS node.

	// The IPFS HTTP API endpoint for pinning, providing, and putting data.
	// Used for writing data to your own IPFS node. Leave undefined if you don't have your own IPFS node.
	IPFS_API_URL: undefined, // "http://127.0.0.1:5001" if you have a local IPFS node.

	// If true, data will be put (added) to your IPFS node via the API whenever possible.
	// Value is ignored if IPFS_API_URL is undefined or if the AccumulatorClient can't reach it.
	IPFS_PUT_IF_POSSIBLE: true,

	// If true, data will be pinned to your IPFS node to prevent garbage collection.
	// Value is ignored if IPFS_API_URL is undefined, or if the AccumulatorClient can't reach it, or
	// if IPFS_PUT_IF_POSSIBLE is false.
	IPFS_PIN_IF_POSSIBLE: true,

	// If true, your IPFS node will "provide" (advertise) data to the IPFS DHT for discoverability.
	// Value is ignored if IPFS_API_URL is undefined, or if the AccumulatorClient can't reach it, or
	// if IPFS_PIN_IF_POSSIBLE is false.
	IPFS_PROVIDE_IF_POSSIBLE: true,

	// (Optional) Path to the local database file for persistent storage (Node.js only).
	// If undefined, will default to '.db/accumulator.json' (relative to the current working directory).
	DB_PATH: undefined,

	// (Advanced, optional) Override calldata for the getLatestCID() contract call.
	// Only set if your contract uses a nonstandard method signature.
	GET_LATEST_CID_CALLDATA_OVERRIDE: undefined,

	// (Advanced, optional) Override calldata for the getAccumulatorData() contract call.
	// Only set if your contract uses a nonstandard method signature.
	GET_ACCUMULATOR_DATA_CALLDATA_OVERRIDE: undefined,

	// (Advanced, optional) Override the event signature for LeafInsert events.
	// Only set if your contract uses a nonstandard event signature.
	LEAF_INSERT_EVENT_SIGNATURE_OVERRIDE: undefined,
}

## Gas Costs

The execution gas cost of `_addData` depends on how many **merge steps** are triggered by that particular insert. Most inserts only require a single peak update and are cheap. Occasionally, an insert will trigger a chain of merges — and this is what increases gas (for that insert only).

| Merge Depth | Description                          | Approx Gas     |
| ----------- | ------------------------------------ | -------------- |
| 0           | No merges (new peak at height 0)     | ~12.8k - 15.5k |
| 1           | Merge with 1 peak (into height 1)    | ~19.5k         |
| 2           | Merge with 2 peaks (into height 2)   | ~23.5k         |
| 3           | Merge with 3 peaks (into height 3)   | ~27.5k         |
| 4           | Merge with 4 peaks (into height 4)   | ~31.5k         |
| 5           | Merge with 5 peaks (into height 5)   | ~35.5k         |
| 6           | Merge with 6 peaks (into height 6)   | ~39.5k         |
| 7           | Merge with 7 peaks (into height 7)   | ~43.5k         |
| 8           | Merge with 8 peaks (into height 8)   | ~47.5k         |
| 9           | Merge with 9 peaks (into height 9)   | ~51k           |
| 10          | Merge with 10 peaks (into height 10) | ~55k           |

> ℹ️ Most inserts fall in the **12.5K–23.5K gas** range. Deeper merges are **exponentially rare**:
>
> - Merge depth 3 happens once every 8 inserts
> - Merge depth 6 happens once every 64 inserts
> - Merge depth 9 happens once every 512 inserts

For example, if you insert `2^20` entries (just over 1 million), here’s how often each merge depth occurs:

| Merge Depth | Inserts (%) |
| ----------- | ----------- |
| 0           | 50.0%       |
| 1           | 25.0%       |
| 2           | 12.5%       |
| 3           | 6.25%       |
| 4           | 3.125%      |
| 5           | 1.5625%     |
| 6           | 0.78125%    |
| 7           | 0.390625%   |
| 8           | 0.1953125%  |
| 9           | 0.09765625% |

> ✅ Even after a million inserts, over **87%** of them will require **2 or fewer merges**, keeping gas costs low and consistent.

So the gas cost is determined only by that insert’s merge activity — **not** by the total size of the data set.