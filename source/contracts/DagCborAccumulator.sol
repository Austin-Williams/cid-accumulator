// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "./DagCborCIDEncoder.sol";

// A content-addressable Merkle (mountain range) accumulator 
// using IPLD dag-cbor and CID-based hashing
contract DagCborAccumulator is DagCborCIDEncoder {

    event NewData(bytes newData);

    error CountOverflow();
    error TooManyPeaks();

    bytes32[32] public peaks;  // Fixed-size array for node hashes

    // Packed bitfield layout for peakHeightsBits
    uint256 private constant PEAK_COUNT_OFFSET = 160;
    uint256 private constant PEAK_COUNT_MASK   = 0x1F;           // 5 bits

    uint256 private constant LEAF_COUNT_OFFSET      = 165;
    uint256 private constant LEAF_COUNT_MASK        = 0xFFFFFFFF;     // 32 bits

    /**
    * Packed bitfield containing all peak node heights, peak count, and total leaf count.
    * Layout (from least significant bit to most):
    * Bits 0–159   : 32 peak node heights (5 bits each). heights[i] = (bits >> (i * 5)) & 0x1F
    * Bits 160–164 : peakCount (5 bits) — number of peaks currently in use
    * Bits 165–196 : count (32 bits) — total number of data leaves added
    * Bits 197–255 : Reserved for future use
    * This structure allows us to avoid separate storage slots for peak metadata,
    * reducing gas usage by packing everything into a single uint256.
    */
    uint256 private mmrMetaBits;

    constructor() {
        // Pre-fill peaks with dummy non-zero values
        for (uint256 i = 0; i < 32; i++) {
            peaks[i] = bytes32(uint256(1)); // dummy value for gas optimization
        }
    }

    function _getLeafCount() internal view returns (uint32) {
        return uint32((mmrMetaBits >> LEAF_COUNT_OFFSET) & LEAF_COUNT_MASK);
    }

    function _getHeight(uint256 index) internal view returns (uint8) {
        require(index < 32, "index out of bounds");
        return uint8((mmrMetaBits >> (index * 5)) & 0x1F);
    }

    function _getPeakCount() internal view returns (uint8) {
        return uint8((mmrMetaBits >> PEAK_COUNT_OFFSET) & PEAK_COUNT_MASK);
    }

    function _addData(bytes calldata newData) internal {
        uint256 bits = mmrMetaBits; // read once

        // Get current count and increment
        uint256 count = (bits >> LEAF_COUNT_OFFSET) & LEAF_COUNT_MASK;
        if (count >= type(uint32).max) revert CountOverflow();

        unchecked { count++; }

        bytes32 leafHash = encodeRawBytes(newData);
        bytes32 carryHash = leafHash;
        uint256 carryHeight = 0;

        uint8 peakCount = uint8((bits >> PEAK_COUNT_OFFSET) & PEAK_COUNT_MASK);

        while (
            peakCount > 0 &&
            uint8((bits >> ((peakCount - 1) * 5)) & 0x1F) == carryHeight
        ) {
            bytes32 topHash = peaks[peakCount - 1];
            peakCount--;
            carryHash = _combine(topHash, carryHash);
            unchecked {
                carryHeight++;
            }
        }

        if (peakCount >= 32) revert TooManyPeaks();

        peaks[peakCount] = carryHash;

        // Update packed heights
        uint256 heightShift = peakCount * 5;
        bits &= ~(uint256(0x1F) << heightShift);                  // clear old height
        bits |= uint256(carryHeight) << heightShift;              // set new height

        // Update peakCount
        bits &= ~(PEAK_COUNT_MASK << PEAK_COUNT_OFFSET);          // clear
        bits |= uint256(peakCount + 1) << PEAK_COUNT_OFFSET;      // set

        // Update count
        bits &= ~(LEAF_COUNT_MASK << LEAF_COUNT_OFFSET);                    // clear
        bits |= count << LEAF_COUNT_OFFSET;                            // set

        // Final single SSTORE
        mmrMetaBits = bits;

        emit NewData(newData);
    }

    function getMMRRoot() internal view returns (bytes32 root) {
        uint8 peakCount = _getPeakCount();
        require(peakCount > 0, "no data");
        root = peaks[0];
        for (uint256 i = 1; i < peakCount; i++) {
            root = _combine(root, peaks[i]);
        }
    }

    function getLatestCID() public view returns (bytes memory) {
        bytes32 root = getMMRRoot();
        return _wrapCID(root);
    }

    function _combine(bytes32 left, bytes32 right) internal pure returns (bytes32) {
        return encodeLinkNode(left, right);
    }

    function _wrapCID(bytes32 hash) internal pure returns (bytes memory) {
        // Multihash prefix: sha2-256 (0x12), length 32 (0x20)
        bytes memory multihash = abi.encodePacked(
            hex"12", // SHA2-256 code.
            hex"20", // Length: 32 bytes.
            hash     // The digest.
        );
        return abi.encodePacked(
            hex"01", // CID version 1.
            hex"71", // dag-cbor codec.
            multihash
        );
    }
}

contract Example is DagCborAccumulator {
    function addData(bytes calldata newData) external {
        _addData(newData);
    }

    function addMany(bytes[] calldata newData) external {
        for (uint256 i = 0; i < newData.length; i++) {
            _addData(newData[i]);
        }
    }
}