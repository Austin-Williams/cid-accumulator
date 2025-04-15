// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { DagCborAccumulator } from "./DagCborAccumulator.sol";

contract OwnedExample is DagCborAccumulator {
	address private immutable owner;

	constructor() {
		owner = msg.sender;
	}

	function addData(bytes calldata data) external {
		require(msg.sender == owner, "Unauthorized");	
		_addData(data);
	}

	function addDataMany(bytes calldata data) external {
		require(msg.sender == owner, "Unauthorized");	
		for (uint256 i = 0; i < data.length; i++) {
		_addData(data);
		}
	}
}