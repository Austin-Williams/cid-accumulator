import { createKuboRPCClient } from "kubo-rpc-client"
import "dotenv/config"
import { CID } from "multiformats/cid"

// Use IPFS_RPC_URL from .env, fallback to default
const IPFS_API_URL = process.env.IPFS_RPC_URL || "http://127.0.0.1:5001/api/v0"
const CID_STRING = "bafyreiabiqywpfpmogug36awk6ljctuifcijcssyzyz66b3hug7r5ieupu"

import { resolveMerkleTree } from "../source/shared/ipfs"

// Minimal Blockstore adapter for kubo-rpc-client
class IPFSBlockstore {
	ipfs: ReturnType<typeof createKuboRPCClient>
	constructor(ipfs: ReturnType<typeof createKuboRPCClient>) {
		this.ipfs = ipfs
	}
	async get(cid: CID): Promise<Uint8Array> {
		return await this.ipfs.block.get(cid)
	}
}

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

async function main(cidStr: string) {
	const ipfs = createKuboRPCClient({ url: IPFS_API_URL })
	const blockstore = new IPFSBlockstore(ipfs)
	try {
		// Robustly resolve the submitted-data.json path
		const __filename = fileURLToPath(import.meta.url)
		const __dirname = path.dirname(__filename)
		const submittedPath = path.resolve(__dirname, "../integration/submitted-data.json")
		const submittedData = JSON.parse(fs.readFileSync(submittedPath, "utf8"))
		const expectedLeaves: string[] = submittedData.map((entry: any) => entry.randomBytes)

		const cid = CID.parse(cidStr)
		const leaves = await resolveMerkleTree(cid, blockstore)
		const actualLeaves = leaves.map((leaf) =>
			Array.from(leaf)
				.map((b) => b.toString(16).padStart(2, "0"))
				.join(""),
		)

		let allMatch = true
		if (actualLeaves.length !== expectedLeaves.length) {
			allMatch = false
			console.error(`Leaf count mismatch: got ${actualLeaves.length}, expected ${expectedLeaves.length}`)
		} else {
			for (let i = 0; i < actualLeaves.length; ++i) {
				if (actualLeaves[i] !== expectedLeaves[i]) {
					allMatch = false
					console.error(`Mismatch at index ${i}: got ${actualLeaves[i]}, expected ${expectedLeaves[i]}`)
				}
			}
		}

		if (allMatch) {
			console.log("SUCCESS: All leaves match submitted-data.json in order.")
			process.exit(0)
		} else {
			console.error("FAILURE: Leaves do not match submitted-data.json.")
			process.exit(1)
		}
	} catch (err: any) {
		console.error("Failed to resolve Merkle tree or compare:", err.message || err)
		process.exit(2)
	}
}

main(CID_STRING)
