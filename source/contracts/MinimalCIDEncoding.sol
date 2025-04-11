// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

contract MinimalCIDEncoding {

    function encodeRawBytes(bytes memory data) public pure returns (bytes memory cbor, bytes32 hash) {
        cbor = _encodeBytes(data);
        hash = sha256(cbor);
    }

    function encodeLinkNode(bytes32 leftHash, bytes32 rightHash) public pure returns (bytes memory cbor, bytes32 hash) {
        cbor = abi.encodePacked(
            hex"a2",              // CBOR map with 2 items
            hex"614c",            // key "L"
            _encodeLink(leftHash),
            hex"6152",            // key "R"
            _encodeLink(rightHash)
        );
        hash = sha256(cbor);
    }

    function _encodeLink(bytes32 hash) internal pure returns (bytes memory) {
        // DAG-CBOR IPLD link = tag(42) + byte string = 0xd82a + 0x58 + 33 + 0x00 + CIDv1 (dag-cbor + sha256) + digest
        return abi.encodePacked(
            hex"d82a",         // CBOR tag(42)
            hex"5825",         // CBOR byte string of length 33
            hex"00",           // Identity multibase prefix
            hex"01",           // CIDv1
            hex"71",           // dag-cbor codec
            hex"12",           // sha2-256 code
            hex"20",           // length: 32 bytes
            hash               // digest
        );
    }

    function _encodeBytes(bytes memory data) private pure returns (bytes memory) {
        uint256 len = data.length;
        if (len < 24) {
            return abi.encodePacked(uint8(0x40 + len), data);
        } else if (len < 256) {
            return abi.encodePacked(hex"58", uint8(len), data);
        } else if (len < 65536) {
            return abi.encodePacked(hex"59", _toBigEndian16(uint16(len)), data);
        } else if (len < 4294967296) {
            return abi.encodePacked(hex"5A", _toBigEndian32(uint32(len)), data);
        } else {
            revert("Data too large");
        }
    }

    function _toBigEndian16(uint16 x) private pure returns (bytes memory) {
        bytes memory b = new bytes(2);
        b[0] = bytes1(uint8(x >> 8));
        b[1] = bytes1(uint8(x));
        return b;
    }

    function _toBigEndian32(uint32 x) private pure returns (bytes memory) {
        bytes memory b = new bytes(4);
        b[0] = bytes1(uint8(x >> 24));
        b[1] = bytes1(uint8(x >> 16));
        b[2] = bytes1(uint8(x >> 8));
        b[3] = bytes1(uint8(x));
        return b;
    }
}