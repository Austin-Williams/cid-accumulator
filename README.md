# cid-accumulator

**IMPORTANT:** This has not been audited or even tested. Treat it as a prototype.

Many apps emit smart contract events to record important data that must later be collected off-chain in order to use the app. For instance, some apps (Tornado Cash, Railgun, 0xbow, etc) require the user to collect all commitment values from previous deposit events to reconstruct a Merkle tree in order to spend their deposit. Other apps may emit events for markets, offers, etc that will be rendered in the UI.

Over time, the number of events that need to be collected can grow large. Users without their own node and without a paid-plan RPC provider will find that they quickly hit the free-teir RPC limits when trying to collect the data they need to use these apps. In practice, they usually have to trust a third party to provide the data and trust that they aren't censoring or altering any of the data.

To address this problem, you can store an IPFS CID of a DAG\_CLOB file that contains all data every emitted by your contract. Then your users can query the app contract once to get the CID, then download the entire set of data they need from IPFS. This allows users to get the data they need efficiently. But how can they know that the CID they get from your contract is correct? That's where the `CIDAccumulator` comes in.

Each time you emit new data via the `CIDAccumulator`, it efficeintly calculates the IPFS CID of the DAG\_CLOB file that contains all the data ever emitted from your contract. It keeps the most recent such CID in storage, which can be read via the `getLatestCID` function.

The app devs (or anyone) can run a simple service that watches for events from the app contract, extracts the data from them, and adds/pins the data to IPFS. This allows app devs (or anyone) to give users efficent access to the data they need without users having to trust any third parties.

## How to use

Have your contract inherit from the `CIDAccumulator`.

```solidity
contract Example is CIDAccumulator {
    function adddata(bytes input) external {
        _addData(input);
    }

    function addBatch(bytes[] calldata inputs) external {
        for (uint256 i = 0; i < inputs.length; i++) {
            _addData(inputs[i]);
        }
    }
}
```

Add any `bytes` data you want via the `_addLeaf` function. This costs around 60k gas for any reasonable sized data.

At any time you can call the `getLatestCID` view function to get the IPFS CID of the DAG\_CLOB file that contains all the data that has been added via `_addLeaf` since contract creation (assuming someone has uploaded it to IPFS -- see below).

If nobody has uploaded it to IPFS, you can fall back to the way it is usually done today: getting all the leaves from the contract events yourself, or trusting a third party to do it for you.

## Example nodejs code

See `index.ts` for example code for the bonevolent service providers who upload the data to IPFS, as well as an example of how a normal client would downlaod it.

`npx --no-install tsx ./source/index.ts`

## Notes

This implementation uses an append-only merkle mountain range (rather than a left-heafy merkle tree) for the DAG, so it can scale to arbitrarily many leaves without causing issues for the offchain IPFS nodes.

It stores `log(n_leaves)` of `bytes32` data on the contract, irrespective of how large or small the leaves are.
