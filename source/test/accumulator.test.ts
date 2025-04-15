import { test, expect, vi } from 'vitest'
import { readFile } from 'fs/promises'

// 👇 This must come before the import of `getAccumulatorData`
vi.mock('ethers', async () => {
	const actual = await vi.importActual<typeof import('ethers')>('ethers')

	class MockContract {
		constructor(_address: string, _abi: any, _provider: any) {}
		async getAccumulatorData(): Promise<[bigint]> {
			const raw = await readFile('./source/test/data/accumulatorFixture.json', 'utf8')
			const fixture = JSON.parse(raw)
			const mmrMetaBits = BigInt(fixture.accumulatorData["0"].split(': ')[1])
			return [mmrMetaBits]
		}
	}

	return {
		...actual,
		ethers: {
			...actual.ethers,
			Contract: MockContract
		}
	}
})

// 👇 Now that the mock is set up, safely import this
import { getAccumulatorData } from '../../source/shared/accumulator.ts'

test('getAccumulatorData decodes accumulator bits correctly', async () => {
	const raw = await readFile('./source/test/data/accumulatorFixture.json', 'utf8')
	const fixture = JSON.parse(raw)

	const provider = {} as any
	const result = await getAccumulatorData(provider, fixture.contractAddress)

	expect(result.peakCount).toBe(2)
	expect(result.leafCount).toBe(6)
	expect(result.previousInsertBlockNumber).toBe(89)
	expect(result.deployBlockNumber).toBe(83)
	expect(result.peakHeights.slice(0, result.peakCount)).toEqual([2, 1])
})