// shared/rpc.ts
import { ThrottledProvider } from "./ethereum/ThrottledProvider.ts"
import { ethers } from "ethers"

export function getRPCProvider(url: string): ethers.JsonRpcProvider {
	return new ThrottledProvider(new ethers.JsonRpcProvider(url)) as unknown as ethers.JsonRpcProvider
}
