// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

// Minimal encoder for IPFS CIDs used in an IPLD DAG (dag-cbor codec)
library DagCborCIDEncoder {
	function encodeRawBytes(bytes memory data) internal pure returns (bytes32 hash) {
		uint256 len = data.length;

		if (len >= 4294967296) revert("Data too large");

		// Allocate: max prefix = 5 bytes + data length
		uint256 prefixLen;
		if (len < 24) {
			prefixLen = 1;
		} else if (len < 256) {
			prefixLen = 2;
		} else if (len < 65536) {
			prefixLen = 3;
		} else {
				prefixLen = 5;
	}

		bytes memory cbor = new bytes(prefixLen + len);

		assembly {
			let ptr := add(cbor, 32)

			switch prefixLen
			case 1 {
				mstore8(ptr, add(0x40, len)) // major type 2, small length
			}
			case 2 {
				mstore8(ptr, 0x58)
				mstore8(add(ptr, 1), len)
			}
			case 3 {
				mstore8(ptr, 0x59)
				mstore8(add(ptr, 1), shr(8, len))
				mstore8(add(ptr, 2), and(len, 0xFF))
			}
			case 5 {
				mstore8(ptr, 0x5a)
				mstore8(add(ptr, 1), shr(24, len))
				mstore8(add(ptr, 2), shr(16, len))
				mstore8(add(ptr, 3), shr(8, len))
				mstore8(add(ptr, 4), and(len, 0xFF))
			}

			// Copy `data` into `out` after the prefix
			let dataPtr := add(data, 32)
			let destPtr := add(ptr, prefixLen)
			for { let i := 0 } lt(i, len) { i := add(i, 32) } {
				mstore(add(destPtr, i), mload(add(dataPtr, i)))
			}
		}
		
		hash = sha256(cbor);
	}

	function encodeLinkNode(bytes32 leftHash, bytes32 rightHash) internal pure returns (bytes32 hash) {
		bytes memory cbor = new bytes(87);

		assembly {
			let ptr := add(cbor, 32)

			// Map(2)
			mstore8(ptr, 0xa2)
			mstore8(add(ptr, 1), 0x61)
			mstore8(add(ptr, 2), 0x4c)

			// Link for "L"
			mstore8(add(ptr, 3), 0xd8)
			mstore8(add(ptr, 4), 0x2a)
			mstore8(add(ptr, 5), 0x58)
			mstore8(add(ptr, 6), 0x25)
			mstore8(add(ptr, 7), 0x00)
			mstore8(add(ptr, 8), 0x01)
			mstore8(add(ptr, 9), 0x71)
			mstore8(add(ptr, 10), 0x12)
			mstore8(add(ptr, 11), 0x20)
			mstore(add(ptr, 12), leftHash)

			// Key "R"
			mstore8(add(ptr, 44), 0x61)
			mstore8(add(ptr, 45), 0x52)

			// Link for "R"
			mstore8(add(ptr, 46), 0xd8)
			mstore8(add(ptr, 47), 0x2a)
			mstore8(add(ptr, 48), 0x58)
			mstore8(add(ptr, 49), 0x25)
			mstore8(add(ptr, 50), 0x00)
			mstore8(add(ptr, 51), 0x01)
			mstore8(add(ptr, 52), 0x71)
			mstore8(add(ptr, 53), 0x12)
			mstore8(add(ptr, 54), 0x20)
			mstore(add(ptr, 55), rightHash)
		}

		hash = sha256(cbor);
	}
}