import { createHelia } from 'helia'
import { CID } from 'multiformats/cid'
import { Buffer } from 'buffer'

import { computeSha256, getTestLeaves } from './helpers.ts'
import { buildMMR } from './merkle-mountain-range.ts'
import { computeCID, computeBlockCID } from './ipfs.ts'

async function main() {
	// ==================================================== //
	//				Bonevolent Service Operator Does This
	// ==================================================== //

	// Create a Helia instance (using defaults; adjust as needed).
	const helia = await createHelia()

	// STEP 1: Retrieve the leaves.
	// In your production environment, you would fetch these 32-byte values from contract events.
	// Here, we are using use dummy random data for demonstration.
	const leaves: Buffer[] = getTestLeaves(10);

	// STEP 2: Reconstruct the MMR using the same rules as on chain.
	const { finalRoot, blocks } = await buildMMR(leaves)
	const finalCID = computeCID(finalRoot)
	console.log('Final MMR Root:', finalRoot.toString('hex'))
	console.log('Manually Computed CID (base58):', finalCID.toString())
	console.log('Manually Computed CID (hex):', '0x' + Buffer.from(finalCID.bytes).toString('hex'))

	// STEP 3: For each block, compute its CID and upload it via Helia.
	// Also verify that the CID computed locally exactly matches Helia’s computed CID.
	for (const [_, block] of blocks.entries()) {
		const blockCID = computeBlockCID(block)

		// Upload the block to Helia using its blockstore.
		// Note: Pass the computed CID first, then the block data.
		await helia.blockstore.put(blockCID, block)

		// // Retrieve the block from Helia using its blockstore.
		const fetchedBlock = await helia.blockstore.get(blockCID)

		// (Optional sanity check) Compare the fetched block with the original block.
		if (Buffer.compare(Buffer.from(fetchedBlock), block) !== 0) {
			console.error(`💥 Block CID ${blockCID.toString()} mismatch on retrieval.`)
		}
	}

	// STEP 4: Pin the final root CID so that the entire DAG remains available.
	helia.pins.add(finalCID)
	console.log('💪 Final root CID pinned:', finalCID.toString())

	// ==================================================== //
	//								Client Code Does This
	// ==================================================== //

	// STEP 5: Get the CID and download the data.
	// In your production environment, client would fetch the CID 'finalCID' from 
	// the `getLatestCID` function on the CIDAccumulator smart contract.
	const finalFetchedBlock = await helia.blockstore.get(finalCID)
	const finalFetchedDigest = computeSha256(Buffer.from(finalFetchedBlock))
	const recomputedCID: CID = computeCID(finalFetchedDigest)

	if (finalCID.equals(recomputedCID)) {
		console.log('✅ Success: Computed final CID matches Helia’s stored CID!')
	} else {
		console.error('❌ Final CID mismatch:', finalCID.toString(), recomputedCID)
	}

	// Stop Helia.
	await helia.stop()
}

main().catch((error) => {
	console.error('💥 Error in main:', error)
})

