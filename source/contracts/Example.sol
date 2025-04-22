// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { CIDAccumulator } from "./CIDAccumulator.sol";

contract Example is CIDAccumulator {
	function addData(bytes calldata data) external {
		_addData(data);
	}
}