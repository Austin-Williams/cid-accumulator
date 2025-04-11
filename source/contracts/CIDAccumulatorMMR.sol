// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

import "./MinimalCIDEncoding.sol";

contract CIDAccumulatorMMR is MinimalCIDEncoding {
    event NewData(bytes newData);

    struct Node {
        bytes32 hash;
        uint256 height;
    }

    Node[] public peaks;
    uint256 public count;

    function _addData(bytes memory newData) internal {
        count++;

        (, bytes32 leafHash) = encodeRawBytes(newData);
        Node memory carry = Node({ hash: leafHash, height: 0 });

        while (peaks.length > 0 && peaks[peaks.length - 1].height == carry.height) {
            Node memory top = peaks[peaks.length - 1];
            peaks.pop();
            bytes32 newHash = _combine(top.hash, carry.hash);
            carry = Node({ hash: newHash, height: carry.height + 1 });
        }

        peaks.push(carry);
        emit NewData(newData);
    }

    function _addDataMany(bytes[] memory newItems) internal {
        for (uint256 i = 0; i < newItems.length; i++) {
            _addData(newItems[i]);
        }
    }

    function getMMRRoot() public view returns (bytes32 root) {
        require(peaks.length > 0, "no data");
        root = peaks[0].hash;
        for (uint256 i = 1; i < peaks.length; i++) {
            root = _combine(root, peaks[i].hash);
        }
    }

    function getLatestCID() public view returns (bytes memory) {
        bytes32 root = getMMRRoot();
        return _wrapCID(root);
    }

    function _combine(bytes32 left, bytes32 right) internal pure returns (bytes32 hash) {
        (, bytes32 digest) = encodeLinkNode(left, right);
        hash = digest;
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

contract Example is CIDAccumulatorMMR {
    function addData(bytes calldata newData) external {
        _addData(newData);
    }

    function addMany(bytes[] calldata newData) external {
        _addDataMany(newData);
    }
}