import "dotenv/config"
import { Pinner } from "../source/pinner/Pinner"
import { create as createKuboRPC } from "kubo-rpc-client"
import { ethers } from "ethers"
import { getPinnerConfig } from "../source/pinner/runPinnerService"

async function main() {
	const { contractAddress, ethereumRpcProviderUrl, ipfsApiUrl } = await getPinnerConfig()
	console.log("[integration test] Using provider URL:", ethereumRpcProviderUrl)

	const provider = new ethers.JsonRpcProvider(ethereumRpcProviderUrl)
	const kuboRPC = createKuboRPC({ url: ipfsApiUrl })
	const pinner = await Pinner.init(contractAddress, provider, kuboRPC)

	console.log("[pinner] Syncing leaves from contract...")
	//await pinner.syncBackward()
	await pinner.syncForward()

	await pinner.verifyRootCID()
}

main().catch((e) => {
	console.error("ERROR:", e)
	process.exit(1)
})
