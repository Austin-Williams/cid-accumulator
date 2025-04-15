import { test, expect } from "vitest"
import { CID } from "multiformats/cid"
import * as dagCbor from "@ipld/dag-cbor"
import { sha256 } from "multiformats/hashes/sha2"
import { MerkleMountainRange } from "../source/shared/mmr.ts"
import { resolveMerkleTree } from "../source/shared/ipfs.ts"
import { readFile } from "node:fs/promises"
import { encodeBlock } from "../source/shared/codec.ts"

import { createHelia } from "helia"

test("resolveMerkleTree reconstructs leaf data in order", async () => {
	const raw = await readFile(new URL("./data/accumulatorFixture.json", import.meta.url), "utf8")
	const fixture = JSON.parse(raw)
	const flattened = fixture.events.flat()

	const helia = await createHelia()
	const blockstore = helia.blockstore

	const mmr = new MerkleMountainRange()

	const originalLeafBuffers: Uint8Array[] = []

	for (const event of flattened) {
		const data = Uint8Array.from(Buffer.from(event.args.newData.slice(2), "hex"))
		originalLeafBuffers.push(data)

		const {
			leafCID,
			combineResultsCIDs,
			combineResultsData,
			rightInputsCIDs,
			peakBaggingCIDs,
			peakBaggingData,
			rootCID,
		} = await mmr.addLeafWithTrail(data)

		// Store leaf node
		const encodedLeafData = await encodeBlock(data)
		await blockstore.put(CID.parse(leafCID), encodedLeafData.bytes)

		// Store internal merge nodes
		for (let i = 0; i < combineResultsCIDs.length; i++) {
			await blockstore.put(CID.parse(combineResultsCIDs[i]), combineResultsData[i])
		}

		// Store peak bagging nodes
		for (let i = 0; i < peakBaggingCIDs.length; i++) {
			await blockstore.put(CID.parse(peakBaggingCIDs[i]), peakBaggingData[i])
		}
	}

	// Use rootCID from the fixture to validate full traversal
	const rootCID = CID.decode(Uint8Array.from(Buffer.from(fixture.latestCID.slice(2), "hex")))

	const resolved = await resolveMerkleTree(rootCID, blockstore)

	expect(resolved).toEqual(originalLeafBuffers)
})

test("resolveMerkleTree handles raw CID link node", async () => {
	const helia = await createHelia()
	const blockstore = helia.blockstore

	const leafData = new TextEncoder().encode("leaf")
	const leafEncoded = dagCbor.encode(leafData)
	const leafHash = await sha256.digest(leafEncoded)
	const leafCID = CID.createV1(dagCbor.code, leafHash)

	await blockstore.put(leafCID, leafEncoded)

	const linkNode = dagCbor.encode(leafCID)
	const linkHash = await sha256.digest(linkNode)
	const linkCID = CID.createV1(dagCbor.code, linkHash)

	await blockstore.put(linkCID, linkNode)

	const result = await resolveMerkleTree(linkCID, blockstore)

	expect(result).toEqual([leafData])
})

test("resolveMerkleTree throws on unexpected structure", async () => {
	const helia = await createHelia()
	const blockstore = helia.blockstore

	const weirdObject = { foo: "bar" }
	const encoded = dagCbor.encode(weirdObject)
	const hash = await sha256.digest(encoded)
	const cid = CID.createV1(dagCbor.code, hash)

	await blockstore.put(cid, encoded)

	await expect(resolveMerkleTree(cid, blockstore)).rejects.toThrow("Unexpected node structure")
})
