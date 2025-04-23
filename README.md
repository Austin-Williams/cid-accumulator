# cid-accumulator

> ⚠️ **Warning:** This project is unaudited and has not been thoroughly tested.

## What it does

- Trustlessly computes and stores an IPFS CID on-chain that represents **all emitted event data**
- Computes the CID incrementally as new data is added
- Allows users to fetch the full dataset from IPFS using a single `getLatestCID()` call

## Why we need it

Apps often emit on-chain events that users need later — like deposit events, offers, or market data. But querying and reconstructing large event logs is inefficient, especially for users on free-tier RPCs.

Too often, app developers rely on centralized services to provide the data directly to their users. This has two serious problems. First, if the centralized service goes offline, the users can't use the app because they can't get the data. Second, while the users could _in principle_ verify the data they get against the blockchain, _in practice_ they can't because that requires running their own node or using a paid-tier RPC provider. So data verifiability is inaccessible to most users of centralized data providers.

Storing the data on IPFS solves the first problem -- it lets users get the data they need even when the centralized service goes offline. All they need it the IPFS CID (Content Identifier) for the data. But it does not solve the second problem -- how do users get and verify the CID they need without having to trust anyone?

This contract, the `CIDAccumulator`, solves that by having _the smart contract itself_ compute and store an IPFS CID that points to a file containing all data ever emitted by the contract. The contract maintains this CID as an accumulator. Users can fetch everything they need directly from IPFS, with full trust in the data’s integrity — because _the smart contract itself_ computed the CID.

## How to use it

### On-chain component
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

### Off-chain component

The client-side UI can then call `getLatestCID()` to retrieve the IPFS CID of the file that includes all data added so far. But what if that CID is not available on IPFS?

The `CIDAccumulator` is designed so that you can efficiently compute the _previous_ CID from the current CID + the small amount of data that was emitted by the contract during the last data insert. This allows you to efficiently "walkback" from the current CID through previous CIDs until you find one that is available on IPFS.

A nice feature of this CID-walkback is that, once you find an older CID that is available on IPFS, you'll have already collected all the data between it and the current CID (because you gathered it as you "walked back"). So you'll be fully synced!

(In the worst case, if you never find any of the CIDs on IPFS, you'll eventually walk all the way back to the contract deployent block. If that happens you'll have fully synced using event data alone -- with no help from IPFS.)

This is all handled by a light-weight `AccumulatorClient` class.

### Accumulator Client

The `AccumulatorClient` is a light-weight universal JS/TS class that:
- Collects and verifies all historical contract data using IPFS (and filling in gaps with contract event data wherever needed) using the walkback method described above.
- Stores the data in a local database (IndexedDB in the browser, or as a JSON file in Nodejs).
- Monitors the chain for new data inserts and stores them as they happen.
- (Optionally) Pins and provides (advertises) the data on IPFS.

The `AccumulatorClient` can be used directly in your front end code, or kept running long term in a NodeJs environment to ensure the data remains pinned and available for everyone.

### Example use

Set your conifguration options in `config.ts`. See `config.example.ts` for a full explaination of the options.

```typescript
// Example config
export const config: AccumulatorClientConfig = {
	ETHEREUM_HTTP_RPC_URL: "https://mainnet.infura.io/v3/<YOUR_INFURA_KEY>",
	ETHEREUM_WS_RPC_URL: undefined, // or "wss://mainnet.infura.io/ws/v3/<YOUR_INFURA_KEY>"
	CONTRACT_ADDRESS: "<YOUR_CONTRACT_ADDRESS>",
	IPFS_GATEWAY_URL: "https://ipfs.io/ipfs", // or "http://127.0.0.1:8080" if you run a local IPFS node
	IPFS_API_URL: "http://127.0.0.1:5001", // or undefined if you don't run your own IPFS node
	IPFS_PUT_IF_POSSIBLE: true,
	IPFS_PIN_IF_POSSIBLE: true,
	IPFS_PROVIDE_IF_POSSIBLE: true,
	DB_PATH: undefined
}
```

Then you can use the client in NodeJs or the browser:

```typescript
...

// Create the client
const accumulatorClient = new AccumulatorClient(...)

// Start the client
await accumulatorClient.start()

...

```

Progress will be shown in console logs. Example:

```console
 % npx --no-install tsx ./example.ts
[Accumulator] 📤 Found 0 leafs in DB
[Accumulator] 👀 Checking Ethereum connection...
[Accumulator] ✅ Connected to Ethereum node, chainId: 0xaa36a7
[Accumulator] 👀 Checking IPFS Gateway connection...
[Accumulator] ✅ Connected to IPFS Gateway.
[Accumulator] 👀 Checking IPFS API connection (attempting to PUT a block)...
[Accumulator] ✅ Connected to IPFS API and verified it can PUT blocks.
[Accumulator] 👀 Checking if IPFS API can provide (advertise) blocks...
[Accumulator] ✅ Connected to IPFS API and verified it can PROVIDE blocks.
[Accumulator] ✅ Successfully initialized. Summary:
[Accumulator] 📜 Summary: IPFS Gateway connected: YES
[Accumulator] 📜 Summary: IPFS API PUT is set up: YES
[Accumulator] 📜 Summary: IPFS API PIN is set up: YES
[Accumulator] 📜 Summary: IPFS API PROVIDE is set up: YES
[Accumulator] 🔁 Syncing backwards from block 8180977 to block 8147142 (33835 blocks), grabbing 1000 blocks per RPC call.
[Accumulator] 🔎 Simultaneously checking IPFS for older root CIDs as we discover them.
[Accumulator] 📦 Checking blocks 8179978 to 8180977 for LeafInsert events...
[Accumulator] 🍃 Found 23 LeafInsert events
[Accumulator] 📦 Checking blocks 8178978 to 8179977 for LeafInsert events...
[Accumulator] 📦 Checking blocks 8177978 to 8178977 for LeafInsert events...
[Accumulator] 📦 Checking blocks 8176978 to 8177977 for LeafInsert events...
[Accumulator] 📦 Checking blocks 8175978 to 8176977 for LeafInsert events...
[Accumulator] 📦 Checking blocks 8174978 to 8175977 for LeafInsert events...
[Accumulator] 📦 Checking blocks 8173978 to 8174977 for LeafInsert events...
[Accumulator] 🍃 Found 105 LeafInsert events
[Accumulator] 📦 Checking blocks 8172978 to 8173977 for LeafInsert events...
[Accumulator] 🍃 Found 3 LeafInsert events
[Accumulator] 📦 Checking blocks 8171978 to 8172977 for LeafInsert events...
[Accumulator] 📥 Downloaded all data for root CID bafyreihty4icxhngqeypbzlfgpmwuecbshkvk5sugy6m7qhgaycx3b2ffi from IPFS.
[Accumulator] 🙌 Successfully resolved all remaining data from IPFS!
[Accumulator] ✅ Your accumulator node is synced!
[Accumulator] ⛰️ Rebuilding the Merkle Mountain Range from synced leaves and pinning to IPFS...
[Accumulator] ✅ Fully rebuilt the Merkle Mountain Range up to leaf index 177
[Accumulator] 👎 No ETHEREUM_WS_RPC_URL provided, will use polling.
[Accumulator] 👀 Using polling for live sync.
[Accumulator] 📌 Attempting to pin all 522 CIDs (leaves, root, and intermediate nodes) to IPFS. Running in background. Will update you...
[Accumulator] 📌 UPDATE: Re-pinned 100 CIDs to IPFS so far. Still working...
[Accumulator] 📌 UPDATE: Re-pinned 200 CIDs to IPFS so far. Still working...
[Accumulator] 📌 UPDATE: Re-pinned 300 CIDs to IPFS so far. Still working...
[Accumulator] 📌 UPDATE: Re-pinned 400 CIDs to IPFS so far. Still working...
[Accumulator] 📌 UPDATE: Re-pinned 500 CIDs to IPFS so far. Still working...
[Accumulator] ✅ Pinned 522 CIDs to IPFS (0 failures). Done!
```

You can find a full working example in `./example.ts`.

> 🚧 Mainnet example anyone can submit data to for testing coming soon (maybe).

### ⛽ Gas Costs

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