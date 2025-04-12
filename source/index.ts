import { createHelia } from "helia"
import { resolveMerkleTree, MerkleMountainRange } from "./utils/ipfs.ts"

const generateRandomBytes = (): Uint8Array => {
	const length = Math.floor(Math.random() * 257) // generates a number between 0 and 256 inclusive
	return crypto.getRandomValues(new Uint8Array(length))
}

const main = async () => {
	const helia = await createHelia()
	const blockstore = helia.blockstore

	const blockData = Array.from({ length: 11 }, () => generateRandomBytes())
	console.log(
		"\nTesting with randomly generated data blocks:\n" +
			JSON.stringify(blockData.map((b) => "0x" + Buffer.from(b).toString("hex"))) +
			"\n"
	)

	const MMR = new MerkleMountainRange(blockstore)
	await MMR.addLeaves(blockData)
	const rootCid = await MMR.rootCID()

	console.log("Merkle Root CID:", rootCid.toString())
	console.log("Merkle Root CID (hex):", "0x" + Buffer.from(rootCid.bytes).toString("hex"))

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
