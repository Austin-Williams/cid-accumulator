// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

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
    event NewLeaf(bytes indexed newLeaf, bytes newIpfsCid);

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

    // Helper function to CBOR-encode a byte string of arbitrary length.
    function _encodeBytes(
        bytes memory data
    ) private pure returns (bytes memory) {
        uint256 len = data.length;
        // For small byte strings (length < 24), the header is one byte: 0x40 + length.
        if (len < 24) {
            return abi.encodePacked(uint8(0x40 + uint8(len)), data);
        } else if (len < 256) {
            // For lengths 24..255, header is 0x58 followed by one byte for length.
            return abi.encodePacked(hex"58", uint8(len), data);
        } else if (len < 65536) {
            // For lengths 256..65535, header is 0x59 followed by two bytes (big-endian).
            return abi.encodePacked(hex"59", _toBigEndian16(uint16(len)), data);
        } else if (len < 4294967296) {
            // For lengths 65536..2^32-1, header is 0x5A followed by four bytes (big-endian).
            return abi.encodePacked(hex"5A", _toBigEndian32(uint32(len)), data);
        } else {
            revert("Data too large");
        }
    }

    // Helper function: converts a uint16 to its big-endian representation in 2 bytes.
    function _toBigEndian16(uint16 x) private pure returns (bytes memory) {
        bytes memory b = new bytes(2);
        b[0] = bytes1(uint8(x >> 8));
        b[1] = bytes1(uint8(x));
        return b;
    }

    // Helper function: converts a uint32 to its big-endian representation in 4 bytes.
    function _toBigEndian32(uint32 x) private pure returns (bytes memory) {
        bytes memory b = new bytes(4);
        b[0] = bytes1(uint8(x >> 24));
        b[1] = bytes1(uint8(x >> 16));
        b[2] = bytes1(uint8(x >> 8));
        b[3] = bytes1(uint8(x));
        return b;
    }

    // Function to encode a leaf node.
    // Now supports an arbitrary byte string by CBOR-encoding a map with one key-value pair.
    // The key "v" is always encoded as in your previous version.
    function _encodeLeaf(
        bytes memory newValue
    ) private pure returns (bytes memory) {
        return
            abi.encodePacked(
                hex"a1", // CBOR map with one key-value pair.
                hex"6176", // Key: "v" (0x76 in ASCII) with length 1.
                _encodeBytes(newValue) // Encodes the newValue with the proper length header.
            );
    }

    // Appends a new leaf to the MMR.
    // It updates the peaks array by merging nodes of equal height.
    function _addLeaf(bytes memory newLeafValue) internal {
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
    function addLeaf(bytes calldata input) external {
        _addLeaf(input);
    }

    function addBatch(bytes[] calldata inputs) external {
        for (uint256 i = 0; i < inputs.length; i++) {
            _addLeaf(inputs[i]);
        }
    }
}
