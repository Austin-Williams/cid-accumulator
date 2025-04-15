// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { DagCborAccumulator } from "./DagCborAccumulator.sol";

contract Example is DagCborAccumulator {
	function addData(bytes calldata data) external {
		_addData(data);
	}
}