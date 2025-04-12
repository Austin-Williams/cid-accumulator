# cid-accumulator

> ⚠️ **Warning:** This project is unaudited and has not been thoroughly tested.

### What it does

- Trustlessly computes and stores an IPFS CID on-chain that represents **all emitted event data**
- Computes the CID incrementally as new data is added
- Allows users to fetch the full dataset from IPFS using a single `getLatestCID()` call

Apps often emit on-chain events that users need later — like Merkle tree commitments, offers, or market data. But querying and reconstructing large event logs is inefficient, especially for users on free-tier RPCs.

This contract solves that by having _the smart contract itself_ compute and store an IPFS CID (using the `dag-cbor` codec) that points to a file containing all data ever emitted. The contract maintains this CID as an accumulator root. A lightweight (and untrusted) off-chain service can watch events and publish the data to IPFS. Users can fetch everything they need directly from IPFS, with full trust in the data’s integrity — because _the smart contract itself_ computed the CID.

### Usage

Have your contract inherit from the `DagCborAccumulator` contract.

```solidity
contract Example is DagCborAccumulator {
    function addData(bytes calldata newData) external {
        _addData(newData);
    }
}
```

You can call `_addData` with any `bytes` payload you'd like to include in the accumulator. This appends the data to the internal Merkle Mountain Range (MMR) and updates the CID.

> ℹ️ Most inserts fall in the 13k–19k gas range. See below for more about gas costs.

Use `getLatestCID()` to retrieve the IPFS CID of the file that includes all data added so far.

### ⛽ Gas Costs

The execution gas cost of `_addData` depends on how many **merge steps** are triggered by that particular insert. Most inserts only require a single peak update and are cheap. Occasionally, an insert will trigger a chain of merges — and this is what increases gas (for that insert only).

| Merge Depth | Description                        | Approx Gas |
| ----------- | ---------------------------------- | ---------- |
| 0           | No merges (new peak at height 0)   | ~12,785    |
| 1           | Merge with 1 peak (into height 1)  | ~17,285    |
| 2           | Merge with 2 peaks (into height 2) | ~21,785    |
| 3           | Merge with 3 peaks (into height 3) | ~26,285    |
| 4           | Merge with 4 peaks (into height 4) | ~30,785    |
| 5           | Merge with 5 peaks (into height 5) | ~35,285    |
| 6           | Merge with 6 peaks (into height 6) | ~39,785    |

> ℹ️ Most inserts fall in the **13k–19k gas** range. Deeper merges are **exponentially rare**:
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

### Service providers and clients

> 🚧 In Progess

See `index.ts` for example code for the bonevolent service providers who upload the data to IPFS, as well as an example of how a normal client would downlaod it.

`npx --no-install tsx ./source/index.ts`
