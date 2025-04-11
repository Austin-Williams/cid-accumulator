import { createHelia } from "helia"
import { resolveMerkleTree, MerkleMountainRange } from "./utils/ipfs.ts"

const generateRandomString = (): string => {
	return Array.from(crypto.getRandomValues(new Uint8Array(16)))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
}

const main = async () => {
	const helia = await createHelia()
	const blockstore = helia.blockstore

	const blockData = Array.from({ length: 11 }, () => generateRandomString())
	console.log("Generated data blocks:", blockData)

	const MMR = new MerkleMountainRange(blockstore)
	await MMR.addLeaves(blockData)
	const rootCid = await MMR.rootCID()

	console.log("Merkle Root CID:", rootCid.toString())

	const allStrings = await resolveMerkleTree(rootCid, blockstore)

	if (JSON.stringify(blockData) === JSON.stringify(allStrings)) {
		console.log("✅ Verification passed: Retrieved data matches original.")
	} else {
		console.error("❌ Verification failed: Retrieved data does not match original.")
	}

	await helia.stop()
}

main().catch(async (err) => {
	console.error(err)
})
