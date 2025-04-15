import { test, expect } from 'vitest'
import { readFile } from 'fs/promises'
import { CID } from 'multiformats/cid'
import { MerkleMountainRange } from '../../source/shared/mmr.ts'
import { create as createMultihashDigest } from 'multiformats/hashes/digest'


test('MMR combineResults and rightInputs match emitted logs', async () => {
	const raw = await readFile('./source/test/data/accumulatorFixture.json', 'utf-8')
	const fixture = JSON.parse(raw)

	const expectedCID = CID.decode(
		Uint8Array.from(Buffer.from(fixture.latestCID.slice(2), 'hex'))
	)

	const mmr = new MerkleMountainRange()
	const flattenedEvents = fixture.events.flat()

	for (let i = 0; i < flattenedEvents.length; i++) {
		const event = flattenedEvents[i]
		const data = Uint8Array.from(Buffer.from(event.args.newData.slice(2), 'hex'))

		const result = await mmr.addLeafWithTrail(
			data,
			event.args.leafIndex,
			i === flattenedEvents.length - 1 ? expectedCID.toString() : undefined
		)

		const digestToCID = (hex: string): string => {
			const digestBytes = Uint8Array.from(Buffer.from(hex.slice(2), 'hex'))
			const digest = createMultihashDigest(0x12, digestBytes)
			return CID.createV1(0x71, digest).toString()
		}
		
		const expectedCombine = event.args.combineResults.map(digestToCID)
		const expectedRightInputs = event.args.rightInputs.map(digestToCID)

		expect(result.combineResultsCIDs).toEqual(expectedCombine)
		expect(result.rightInputsCIDs).toEqual(expectedRightInputs)
	}

	const finalRoot = await mmr.rootCID()
	expect(finalRoot.toString()).toBe(expectedCID.toString())
})

test('addLeafWithTrail throws if expectedLeafIndex does not match internal leaf count', async () => {
	const mmr = new MerkleMountainRange()
	const leaf = Uint8Array.from([1, 2, 3])

	// Add one leaf to increment internal leafCount to 1
	await mmr.addLeafWithTrail(leaf)

	// Now try adding another leaf, but pretend we expect leafIndex 0 (incorrect)
	await expect(
		mmr.addLeafWithTrail(leaf, 0)
	).rejects.toThrow('Expected leafIndex 1 but got 0')
})

test('addLeafWithTrail throws if expectedNewRootCID does not match actual root', async () => {
	const mmr = new MerkleMountainRange()
	const leaf = Uint8Array.from([4, 5, 6])

	// Provide a clearly incorrect expected root CID
	const fakeCID = 'bafybeifakefakefakefakefakefakefakefakefakefakefakefakefakefake'

	await expect(
		mmr.addLeafWithTrail(leaf, 0, fakeCID)
	).rejects.toThrow(
		// Optional: you can match just the start if dynamic parts make it brittle
		/Expected new root CID/
	)
})

test('rootCIDWithTrail returns canonical empty CID and no trail when no leaves are added', async () => {
	const mmr = new MerkleMountainRange()
	const result = await mmr.rootCIDWithTrail()

	expect(result.root.toString()).toBe('bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku')
	expect(result.cids).toEqual([])
	expect(result.data).toEqual([])
})

test('throws if no peak to merge due to corrupted internal state', async () => {
	// Inline subclass for controlled corruption
	class BrokenMMR extends MerkleMountainRange {
		public corruptState(leafCount: number, clearPeaks: boolean = true) {
			// @ts-ignore accessing private for test purposes
			this.leafCount = leafCount
			if (clearPeaks) {
				// @ts-ignore
				this.peaks = []
			}
		}
	}

	const mmr = new BrokenMMR()
	mmr.corruptState(1) // leafCount = 1, triggers the merge loop, but peaks = []

	const input = Uint8Array.from([1, 2, 3])
	await expect(mmr.addLeafWithTrail(input)).rejects.toThrow('MMR structure error: no peak to merge')
})
