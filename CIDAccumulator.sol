// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

abstract contract CIDAccumulator {
    // Represents a node in the Merkle Mountain Range (MMR):
    // - 'hash' is the node's digest.
    // - 'height' is 0 for leaves, >0 for internal nodes.
    struct Node {
        bytes32 hash;
        uint256 height;
    }

    // The current MMR peaks (fringes) are kept on-chain.
    Node[] public peaks;

    // Total number of leaves that have been added.
    uint256 public count;

    // Event emitted on each poke.
    event NewLeaf(bytes32 indexed newLeaf, bytes newIpfsCid);

    // Function to "combine" two nodes into a new parent node.
    // The combination is performed by CBOR-encoding a map with keys "L" and "R" and then taking sha256.
    function _combine(
        bytes32 left,
        bytes32 right
    ) private pure returns (bytes32) {
        return
            sha256(
                abi.encodePacked(
                    hex"a2", // CBOR: map with 2 key-value pairs.
                    hex"614c", // Key: text "L" ('L' = 0x4c) with length 1.
                    hex"5820", // CBOR: byte string of length 32.
                    left, // Value: left node.
                    hex"6152", // Key: text "R" ('R' = 0x52) with length 1.
                    hex"5820", // CBOR: byte string of length 32.
                    right // Value: right node.
                )
            );
    }

    // Function to encode a leaf node.
    // Here, we encode the leaf as a CBOR map with one key-value pair.
    // Key "v" (0x76) holds the raw 32-byte value.
    // CBOR encoding breakdown:
    //   a1        // map with 1 pair
    //   61 76     // key: "v" (a 1-character text string)
    //   58 20     // byte string of 32 bytes follows
    //   <value>   // the actual 32-byte value
    // This prevents tree-extension attacks which would otherwise be a DoS vector.
    function _encodeLeaf(bytes32 newValue) private pure returns (bytes memory) {
        return
            abi.encodePacked(
                hex"a1", // Map with one key-value pair.
                hex"6176", // Key: "v" (0x76 is ASCII for 'v') with length 1.
                hex"5820", // CBOR tag indicating a byte string of length 32.
                newValue // The actual 32-byte value.
            );
    }

    // Appends a new leaf to the MMR.
    // It updates the peaks array by merging nodes of equal height.
    function _addLeaf(bytes32 newLeafValue) internal {
        count += 1;

        // Compute the leaf's CBOR encoding and then its hash.
        bytes memory leafCbor = _encodeLeaf(newLeafValue);
        bytes32 leafHash = sha256(leafCbor);

        // Initialize a new node ("carry") from the leaf.
        Node memory carry = Node({hash: leafHash, height: 0});

        // While there's a peak with the same height, merge (combine) it.
        while (
            peaks.length > 0 && peaks[peaks.length - 1].height == carry.height
        ) {
            Node memory leftNode = peaks[peaks.length - 1];
            peaks.pop(); // Remove the last peak.
            // Combine the two nodes; the result has height = carry.height + 1.
            carry.hash = _combine(leftNode.hash, carry.hash);
            carry.height += 1;
        }
        // Push the resulting node onto the peaks array.
        peaks.push(carry);

        // Emit an event with the new value and the current overall CID.
        emit NewLeaf(newLeafValue, getLatestCID());
    }

    // Computes the aggregate MMR root by "bagging" the peaks.
    // This simply combines the peaks sequentially.
    function getMMRRoot() public view returns (bytes32) {
        if (peaks.length == 0) {
            return bytes32(0);
        }
        bytes32 root = peaks[0].hash;
        for (uint256 i = 1; i < peaks.length; i++) {
            root = _combine(root, peaks[i].hash);
        }
        return root;
    }

    // Constructs and returns the latest CID as a byte array.
    // The CID is built from the aggregate MMR root using:
    //   - Multihash: 0x12 (sha256) || 0x20 (32 bytes) || <hash>
    //   - CIDv1: 0x01 (version 1) || 0x71 (dag-cbor codec) || <multihash>
    function getLatestCID() public view returns (bytes memory) {
        bytes32 root = getMMRRoot();
        bytes memory multihash = abi.encodePacked(
            hex"12", // SHA2-256 code.
            hex"20", // Length: 32 bytes.
            root // The digest.
        );
        return
            abi.encodePacked(
                hex"01", // CID version 1.
                hex"71", // dag-cbor codec.
                multihash // The multihash.
            );
    }
}

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
