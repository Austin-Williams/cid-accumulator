// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { CIDAccumulator } from "./CIDAccumulator.sol";

contract Example is CIDAccumulator {
	function appendLeaf(bytes calldata data) external {
		_appendLeaf(data);
	}
	function appendLeafMany(bytes[] calldata data) external {
		for (uint256 i = 0; i < data.length; i++) {
			_appendLeaf(data[i]);
		}
	}
}