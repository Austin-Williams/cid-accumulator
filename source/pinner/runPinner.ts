import "dotenv/config"
import { startIpfsNode } from "./ipfsNodeManager.ts"
import { Pinner } from "./Pinner.ts"
import { ethers } from "ethers"
import { promptUserChoice } from "../shared/userPrompt.ts"

async function main() {
	// 1. Gather config
	const contractAddress =
		process.env.TARGET_CONTRACT_ADDRESS ||
		(await promptUserChoice("Contract address? ", [], false))
	const rpcUrl =
		process.env.RPC_PROVIDER_URL ||
		(await promptUserChoice("RPC URL? ", [], false))
	let ipfsNodeUrl = process.env.IPFS_NODE_URL

	let ipfsController = null
	if (!ipfsNodeUrl) {
		ipfsController = await startIpfsNode()
		ipfsNodeUrl = ipfsController.apiAddr
		console.log(`[pinner] Using IPFS node at ${ipfsNodeUrl}`)
		if (ipfsController.isTemporary) {
			console.log(`[pinner] (Temporary IPFS node: repo will be deleted on exit)`)
		} else {
			console.log(`[pinner] (Persistent IPFS node: repo at ${ipfsController.repoPath})`)
		}
	}

	const provider = new ethers.JsonRpcProvider(rpcUrl)
	const pinner = await Pinner.init(contractAddress, provider, ipfsNodeUrl)

	// Graceful shutdown
	const shutdown = async () => {
		console.log("\n[pinner] Shutting down gracefully...")
		await pinner.shutdown?.()
		if (ipfsController) await ipfsController.stop()
		process.exit(0)
	}
	process.on("SIGINT", shutdown)
	process.on("SIGTERM", shutdown)

	// TODO: Implement syncBackward, startListeningForEvents, and full pinning logic here.
	console.log(
		"[pinner] TODO: Syncing and event listening not yet implemented. The Pinner is initialized and ready for future logic.",
	)

	console.log("[pinner] Running. Press Ctrl+C to exit.")
}

main().catch((e) => {
	console.error("[pinner] Fatal error:", e)
	process.exit(1)
})
