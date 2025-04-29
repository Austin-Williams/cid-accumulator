// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/// @title DagCborCIDEncoder
/// @notice Provides CBOR byte-string encoding and CID link-node construction for IPFS/IPLD.
/// @dev Implements RFC 7049 §2.1 for byte strings and builds DAG-CBOR link nodes per Multiformats (CIDv1/Multihash).
library DagCborCIDEncoder {

	error CBORLengthOverflow(uint256 len);

	// Maximum payload length that fits in a 4-byte CBOR length prefix (2^32−1)
	uint256 private constant MAX_CBOR_BYTESTRING_LENGTH = type(uint32).max;

	/// @notice Encodes raw bytes into CBOR byte-string encoding (RFC 7049 §2.1) and then returns its SHA-256 digest.
	/// @param data The raw bytes to encode as a DAG-CBOR block
	/// @return hash The SHA-256 digest of the CBOR-encoded data
	/// @dev Major type 2 (byte string) is encoded in the top three bits: 0x40
	/// @dev The low five bits carry the length if it’s ≤ 23. Otherwise you use a special “additional‐info” value and follow it with 1, 2, or 4 bytes of length.
	/// @dev Example: If data is 0xdeadbeef, then the CBOR prefix is 0x40 (major type 2) + 4 (length) = 0x44. So this function returns sha256(0x44deadbeef).
	/// @dev See also: [RFC 7049 §2.1](https://datatracker.ietf.org/doc/html/rfc7049#section-2.1)
	function encodeRawBytes(bytes memory data) internal pure returns (bytes32 hash) {
		uint256 len = data.length;

		if (len > MAX_CBOR_BYTESTRING_LENGTH) revert CBORLengthOverflow(len);

		// Allocate: max prefix = 5 bytes + data length
		uint256 prefixLen;
		if (len < 24) {
			// prefixLen = 1
			// single‐byte prefix: 0x40 + len
			// e.g. len=2 → 0x42
			prefixLen = 1;
		} else if (len < 256) {
			// prefixLen = 2
			// 0x58 indicates “next 1 byte is length”
			prefixLen = 2;
		} else if (len < 65536) {
			// prefixLen = 3
			// 0x59 indicates “next 2 bytes is length”
			prefixLen = 3;
		} else {
			// prefixLen = 5
			// 0x5A indicates “next 4 bytes is length”
			prefixLen = 5;
		}

		// Allocate buffer for CBOR: prefixLen (header) + len (payload)
		bytes memory cbor = new bytes(prefixLen + len);

		assembly {
			// ptr = pointer to start of CBOR buffer payload (skip array length slot)
			let ptr := add(cbor, 32)

			// Write CBOR length prefix based on prefixLen
			switch prefixLen
			case 1 {
				// Single-byte CBOR prefix: major type 2 (0x40) + length (0-23)
				mstore8(ptr, add(0x40, len))
			}
			case 2 {
				// One-byte length marker (0x58) + 1-byte length
				mstore8(ptr, 0x58)
				mstore8(add(ptr, 1), len)
			}
			case 3 {
				// Two-byte length: marker (0x59) + 2 bytes big-endian length
				mstore8(ptr, 0x59)
				mstore8(add(ptr, 1), shr(8, len))
				mstore8(add(ptr, 2), and(len, 0xFF))
			}
			case 5 {
				// Four-byte length: marker (0x5A) + 4 bytes big-endian length
				mstore8(ptr, 0x5a)
				mstore8(add(ptr, 1), shr(24, len))
				mstore8(add(ptr, 2), shr(16, len))
				mstore8(add(ptr, 3), shr(8, len))
				mstore8(add(ptr, 4), and(len, 0xFF))
			}

			// Copy the raw data payload into CBOR buffer after header
			let dataPtr := add(data, 32) // pointer to `data` bytes
			let destPtr := add(ptr, prefixLen) // buffer write start
			for { let i := 0 } lt(i, len) { i := add(i, 32) } {
				// copy 32-byte word chunks
				mstore(add(destPtr, i), mload(add(dataPtr, i)))
			}
		}
		
		hash = sha256(cbor);
	}
	/// @notice Encodes two child CIDs into a CBOR map and returns its SHA-256 digest.
	/// @param leftHash Body of the left child CID’s multihash (SHA-256 digest of its CBOR block).
	/// @param rightHash Body of the right child CID’s multihash.
	/// @return hash SHA-256 digest of the CBOR-encoded link node (multihash body).
	/// @dev Constructs CBOR map(2): { "L": link(leftHash), "R": link(rightHash) }.
	/// @dev Each link(x) = CBOR tag(42) + byte-string[37]:
	/// @dev [0x00 identity multibase, 0x01 CIDv1, 0x71 dag-cbor codec, 0x12 sha2-256, 0x20 (32), x]
	/// @dev See also: [IPLD dag-cbor spec](https://ipld.io/specs/codecs/dag-cbor/spec/) for the CBOR map layout.
	/// @dev See also: [Multiformats multicodec table](https://github.com/multiformats/multicodec/blob/master/table.csv) for dag-cbor prefix.
	/// @dev See also: [Multiformats multihash spec](https://github.com/multiformats/multihash?tab=readme-ov-file#format) for multihash format.
	/// @dev See also: [Multiformats CID spec](https://github.com/multiformats/cid?tab=readme-ov-file#cidv1) for CIDv1 format.
	function encodeLinkNode(bytes32 leftHash, bytes32 rightHash) internal pure returns (bytes32 hash) {
		// Allocate buffer for CBOR link node: map header + two CID links
		bytes memory cbor = new bytes(87);

		assembly {
			// ptr = address of first CBOR byte (skip 32-byte length slot)
			let ptr := add(cbor, 32)

			// CBOR map header: map(2) => 0xa2
			mstore8(ptr, 0xa2)

			// key "L": text string length=1 (0x61), character 'L' (0x4c)
			mstore8(add(ptr, 1), 0x61)
			mstore8(add(ptr, 2), 0x4c)

			// CID link for "L": CBOR tag(42) => 0xd8 0x2a
			mstore8(add(ptr, 3), 0xd8)
			mstore8(add(ptr, 4), 0x2a)

			// Byte-string header for link payload (37 bytes): 0x58 + 0x25
			mstore8(add(ptr, 5), 0x58)
			mstore8(add(ptr, 6), 0x25)

			// Multihash prefix: identity multibase(0x00), CIDv1(0x01), dag-cbor codec(0x71), sha2-256(0x12), digest length(0x20)
			mstore8(add(ptr, 7), 0x00)
			mstore8(add(ptr, 8), 0x01)
			mstore8(add(ptr, 9), 0x71)
			mstore8(add(ptr, 10), 0x12)
			mstore8(add(ptr, 11), 0x20)

			// Insert left child digest (32 bytes)
			mstore(add(ptr, 12), leftHash)

			// key "R": text string length=1 (0x61), character 'R' (0x52)
			mstore8(add(ptr, 44), 0x61)
			mstore8(add(ptr, 45), 0x52)

			// CID link for "R" (same tag and headers)
			mstore8(add(ptr, 46), 0xd8)
			mstore8(add(ptr, 47), 0x2a)
			mstore8(add(ptr, 48), 0x58)
			mstore8(add(ptr, 49), 0x25)
			mstore8(add(ptr, 50), 0x00)
			mstore8(add(ptr, 51), 0x01)
			mstore8(add(ptr, 52), 0x71)
			mstore8(add(ptr, 53), 0x12)
			mstore8(add(ptr, 54), 0x20)

			// Insert right child digest (32 bytes)
			mstore(add(ptr, 55), rightHash)
		}

		hash = sha256(cbor);
	}
}