// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Script.sol";
import { Example } from "../source/contracts/DagCborAccumulator.sol";

contract GasProfileScript is Script {
function run() external {
    uint256 privateKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    vm.startBroadcast(privateKey);

    Example example = new Example();

    for (uint256 i = 0; i < 257; i++) {
        bytes memory input = abi.encodePacked(bytes32(keccak256(abi.encodePacked(i))));
        example.addData(input);
    }

    vm.stopBroadcast();
}

}
