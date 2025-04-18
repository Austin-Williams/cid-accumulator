import "dotenv/config"
import { startHeliaNode } from "./ipfsNodeManager.ts"
import { Pinner } from "./Pinner.ts"
import { ethers } from "ethers"
import { promptUserChoice } from "../shared/userPrompt.ts"


async function main() {
	const { contractAddress, rpcUrl, heliaPersistence } = await getPinnerConfig();
	const heliaController = await startHeliaNode(heliaPersistence);

	const provider = new ethers.JsonRpcProvider(rpcUrl);
	const pinner = await Pinner.init(contractAddress, provider, heliaController);

	// Graceful shutdown
	const shutdown = async () => {
		console.log("\n[pinner] Shutting down gracefully...");
		await pinner.shutdown?.();
		await heliaController.stop();
		process.exit(0);
	};
	process.on("SIGINT", shutdown)
	process.on("SIGTERM", shutdown)

	// TODO: Implement syncBackward, startListeningForEvents, and full pinning logic here.
	await pinner.syncForward()

	console.log(
		"[pinner] TODO: Event listening not yet implemented. The Pinner is initialized and ready for future logic."
	);

	console.log("[pinner] Running pinner service. Press Ctrl+C to exit.");
}


type PinnerConfigIntent = {
	contractAddress: string
	rpcUrl: string
	heliaPersistence: boolean
}

async function getPinnerConfig(): Promise<PinnerConfigIntent> {
	console.log("[debug] getPinnerConfig called");
	// Print a visually clear header for configuration
	console.log("\n==============================================")
	console.log("      CID Accumulator Pinner Configuration")
	console.log("==============================================\n")

	// Gather contract address
	let contractAddress: string
	if (process.env.TARGET_CONTRACT_ADDRESS) {
		contractAddress = process.env.TARGET_CONTRACT_ADDRESS
		console.log(`Contract address loaded from .env: ${contractAddress}`)
	} else {
		contractAddress = await promptUserChoice("Contract address [Ethereum, 0x...]: ", [], false)
	}

	// Gather RPC URL
	let rpcUrl: string
	if (process.env.RPC_PROVIDER_URL) {
		rpcUrl = process.env.RPC_PROVIDER_URL
		console.log(`Ethereum RPC URL loaded from .env: ${rpcUrl}`)
	} else {
		rpcUrl = await promptUserChoice("Ethereum RPC URL [e.g. https://rpc.ankr.com/...]: ", [], false)
	}

	// Ask if Helia node should be persistent
	const persistenceChoice = await promptUserChoice("Should the Helia node be persistent? (y/n): ", ["y", "n"], false);
	const heliaPersistence = persistenceChoice.trim().toLowerCase() === "y";

	// Display gathered configuration and prompt for confirmation
	console.log("\n==============================================");
	console.log("         Configuration Summary");
	console.log("==============================================");
	console.log(`Contract address : ${contractAddress}`);
	console.log(`Ethereum RPC URL : ${rpcUrl}`);
	console.log(`Helia node type  : ${heliaPersistence ? "Persistent (repo will be saved)" : "Temporary/In-memory (data lost on exit)"}`);
	console.log("==============================================\n");
	const confirmed = await promptUserChoice("Is this configuration correct? (y/n): ", ["y", "n"], false);
	if (confirmed.trim().toLowerCase() !== "y") {
		console.log("Aborting: Please restart and enter the correct configuration.");
		process.exit(1);
	}
	return { contractAddress, rpcUrl, heliaPersistence }
}


// No longer needed: IPFS node URL logic is gone.



main().catch((e) => {
	console.error("[pinner] Fatal error:", e)
	process.exit(1)
})
