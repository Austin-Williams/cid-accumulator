import { Log } from 'ethers'
import { MINIMAL_ACCUMULATOR_INTERFACE } from './constants.ts'
import { LeafInsertEvent } from './types.ts'

export function decodeLeafInsert(log: Log): LeafInsertEvent {
	const parsed = MINIMAL_ACCUMULATOR_INTERFACE.parseLog(log)

	if (!parsed || parsed.name !== 'LeafInsert') {
		throw new Error(`Unexpected or unrecognized log: ${JSON.stringify(log)}`)
	}

	const { leafIndex, previousInsertBlockNumber, newData, combineResults, rightInputs } = parsed.args

	return {
		leafIndex: Number(leafIndex),
		previousInsertBlockNumber: Number(previousInsertBlockNumber),
		newData,
		combineResults,
		rightInputs
	}
}
