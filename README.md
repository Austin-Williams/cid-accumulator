# cid-accumulator

**IMPORTANT:** This has not been audited or even tested. Treat it as a prototype.

## How to use

Have your contract inherit the `CIDAccumulator`.

```solidity
contract Example is CIDAccumulator {
    function addLeaf(bytes32 input) external {
        _addLeaf(input);
    }

    function addBatch(bytes32[] calldata inputs) external {
        for (uint256 i = 0; i < inputs.length; i++) {
            _addLeaf(inputs[i]);
        }
    }
}
```

Add any `bytes32` data you want via the `_addLeaf` function. This costs about 65k gas.

At any time you can call the `getLatestCID` view function to get the IPFS CID of the CLOB file that contains all the data that has been added via `_addLeaf` since contract creation (assuming someone has uploaded it to IPFS -- see below).

If nobody has uploaded it to IPFS, you can fall back to getting all the leaves from the contract events.

## Example nodejs code

See `index.ts` for example code for the bonevolent service providers who upload the data to IPFS, as well as an example of how a normal client would downlaod it.

`npx --no-install tsx ./source/index.ts`

## Notes

This implementation uses an append-only merkle mountain range (rather than a left-heafy merkle tree) for the DAG, so it can scale to arbitrarily many leaves without causing issues for the offchain IPFS nodes.

It stores `log(n_leaves)` of `bytes32` data on the contract.
