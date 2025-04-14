// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { DagCborCIDEncoder } from "./libraries/DagCborCIDEncoder.sol";

// A content-addressable Merkle (mountain range) accumulator 
// using IPLD dag-cbor and CID-based hashing
contract DagCborAccumulator {
	// LIBRARIES
	using DagCborCIDEncoder for bytes;

	// EVENTS
	event LeafInsert(
		uint32 indexed leafIndex,
		uint32 previousInsertBlockNumber,
		bytes newData,
		bytes32[] combineResults,
		bytes32[] rightInputs
	);

	// CONSTANTS
	// Packed bitfield layout for mmrMetaBits
	uint256 private constant PEAK_COUNT_OFFSET = 160;
	uint256 private constant PEAK_COUNT_MASK   = 0x1F;	// 5 bits
	uint256 private constant LEAF_COUNT_OFFSET = 165;
	uint256 private constant LEAF_COUNT_MASK   = 0xFFFFFFFF;	// 32 bits
	uint256 private constant PREVIOUS_INSERT_BLOCKNUM_OFFSET = 197;
	uint256 private constant PREVIOUS_INSERT_BLOCKNUM_MASK = 0xFFFFFFFF;	// 32 bits
	uint256 private constant DEPLOY_BLOCKNUM_OFFSET = 229;
	uint256 private constant DEPLOY_BLOCKNUM_MASK = (1 << 27) - 1;	// 0x7FFFFFF

	// STATE VARIABLES
	bytes32[32] private peaks;  // Fixed-size array for node hashes
	/**
	* Packed bitfield containing all peak node heights, peak count,
	* total leaf count, the previous insert block number, and the contract
	* deployment block number.
	*
	* Layout (from least significant bit to most):
	* Bits 0–159   : 32 peak node heights (5 bits each). heights[i] = (bits >> (i * 5)) & 0x1F
	* Bits 160–164 : peakCount (5 bits) — number of peaks currently in use
	* Bits 165–196 : leafCount (32 bits) — total number of data leaves added
	* Bits 197–228 : previousInsertBlockNumber (32 bits)
	* Bits 229–255 : deployBlockNumber (27 bits) — block number this contract was deployed in
	*
	* This structure allows us to avoid separate storage slots for peak metadata,
	* reducing gas usage by packing everything into a single uint256.
	*/
	uint256 private mmrMetaBits;

	constructor() {
		// Insert non-zero data into all 32 peaks storage slots for gas optimization
		for (uint256 i = 0; i < 32; i++) {
			peaks[i] = bytes32(uint256(1));
		}

		mmrMetaBits = uint256(block.number) << DEPLOY_BLOCKNUM_OFFSET;
	}

	// EXTERNAL FUNCTIONS
	// For low-level off-chain integration
	function getAccumulatorData() external view returns (uint256, bytes32[32] memory) {
		return (mmrMetaBits, peaks);
	}

	// PUBLIC FUNCTIONS
	function getLatestCID() public view returns (bytes memory) {
		bytes32 root = _getMMRRoot();
		return _wrapCID(root);
	}

	// INTERNAL FUNCTIONS
	function _addData(bytes calldata newData) internal {
		uint256 bits = mmrMetaBits; // SLOAD

		bytes32 carryHash = DagCborCIDEncoder.encodeRawBytes(newData);
		uint256 carryHeight = 0;

		// Get current peak count
		uint8 peakCount = uint8((bits >> PEAK_COUNT_OFFSET) & PEAK_COUNT_MASK);

		// Collect combine steps (max 32 possible for 32 peaks)
		bytes32[32] memory combineResults;
		bytes32[32] memory rightInputs;
		uint8 combineCount = 0;

		// Merge peaks of equal height
		while (
			peakCount > 0 &&
			uint8((bits >> ((peakCount - 1) * 5)) & 0x1F) == carryHeight
		) {
			bytes32 topHash = peaks[peakCount - 1]; // SLOAD
			peakCount--;

			bytes32 combined = _combine(topHash, carryHash);

			// Record the merge for logging
			combineResults[combineCount] = combined;
			rightInputs[combineCount] = carryHash;
			combineCount++;

			carryHash = combined;
			unchecked { carryHeight++; }
		}

		peaks[peakCount] = carryHash; // SSTORE

		// Shrink arrays to actual size
		bytes32[] memory finalCombineResults = new bytes32[](combineCount);
		bytes32[] memory finalRightInputs = new bytes32[](combineCount);
		for (uint8 i = 0; i < combineCount; i++) {
			finalCombineResults[i] = combineResults[i];
			finalRightInputs[i] = rightInputs[i];
		}

		emit LeafInsert(
			uint32((bits >> LEAF_COUNT_OFFSET) & LEAF_COUNT_MASK) + 1,
			uint32((bits >> PREVIOUS_INSERT_BLOCKNUM_OFFSET) & PREVIOUS_INSERT_BLOCKNUM_MASK),
			newData,
			finalCombineResults,
			finalRightInputs
		);

		// Update packed heights
		uint256 heightShift = peakCount * 5;
		bits &= ~(uint256(0x1F) << heightShift);       // clear old height
		bits |= uint256(carryHeight) << heightShift;   // set new height

		// Update peak count
		bits &= ~(PEAK_COUNT_MASK << PEAK_COUNT_OFFSET);
		bits |= uint256(peakCount + 1) << PEAK_COUNT_OFFSET;

		// Update leaf count
		bits &= ~(LEAF_COUNT_MASK << LEAF_COUNT_OFFSET);
		bits |= (uint256((bits >> LEAF_COUNT_OFFSET) & LEAF_COUNT_MASK) + 1) << LEAF_COUNT_OFFSET;

		// Store current block number in mmrMetaBits
		bits &= ~(PREVIOUS_INSERT_BLOCKNUM_MASK << PREVIOUS_INSERT_BLOCKNUM_OFFSET); // clear
		bits |= uint256(block.number) << PREVIOUS_INSERT_BLOCKNUM_OFFSET; // set

		mmrMetaBits = bits; // SSTORE
	}

	function _getLeafCount() internal view returns (uint32) {
		return uint32((mmrMetaBits >> LEAF_COUNT_OFFSET) & LEAF_COUNT_MASK);
	}

	// PRIVATE FUNCTIONS
	function _combine(bytes32 left, bytes32 right) private pure returns (bytes32) {
		return DagCborCIDEncoder.encodeLinkNode(left, right);
	}

	function _getMMRRoot() private view returns (bytes32 root) {
		uint8 peakCount = uint8((mmrMetaBits >> PEAK_COUNT_OFFSET) & PEAK_COUNT_MASK);
		if (peakCount == 0) { return bytes32(0); }
		root = peaks[0];
		for (uint256 i = 1; i < peakCount; i++) {
			root = _combine(root, peaks[i]);
		}
	}

	function _wrapCID(bytes32 hash) private pure returns (bytes memory) {
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