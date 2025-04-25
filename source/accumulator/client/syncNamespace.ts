import type { SyncNamespace } from "../../types/types.ts"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import type { MerkleMountainRange } from "../merkleMountainRange/MerkleMountainRange.ts"

import {
	startSubscriptionSync,
	startPollingSync,
	startLiveSync,
	stopLiveSync,
	syncBackwardsFromLatest
} from "./syncHelpers.ts";

export function getSyncNamespace(
	ipfs: IpfsAdapter,
	mmr: MerkleMountainRange,
	storage: StorageAdapter,
	ethereumHttpRpcUrl: string,
	ethereumWsRpcUrl: string | undefined,
	contractAddress: string,
	lastProcessedBlock: number,
	shouldPut: boolean,
	shouldPin: boolean,
	shouldProvide: boolean,
): SyncNamespace {
	let sync: SyncNamespace = {
		ethereumHttpRpcUrl,
		ethereumWsRpcUrl,
		contractAddress,
		highestCommittedLeafIndex: -1,
		lastProcessedBlock,
		liveSyncRunning: false,
		liveSyncInterval: undefined,
		websocket: undefined,
		startSubscriptionSync: () => startSubscriptionSync(ipfs, mmr, storage, ethereumHttpRpcUrl, ethereumWsRpcUrl, sync.ws, (newWs) => { sync.ws = newWs }, lastProcessedBlock, (b) => { lastProcessedBlock = b }, contractAddress, () => sync.highestCommittedLeafIndex, (i) => { sync.highestCommittedLeafIndex = i; }, shouldPut, shouldProvide),
		startPollingSync: () => startPollingSync(ipfs, mmr, storage, ethereumHttpRpcUrl, contractAddress, () => sync.liveSyncRunning, (interval) => { sync.liveSyncInterval = interval; }, lastProcessedBlock, (b) => { lastProcessedBlock = b; }, () => sync.highestCommittedLeafIndex, (i) => { sync.highestCommittedLeafIndex = i; }, shouldPut, shouldProvide),
		startLiveSync: () => startLiveSync(ipfs, mmr, storage, contractAddress, ethereumHttpRpcUrl, ethereumWsRpcUrl, sync.ws, (newWs) => { sync.ws = newWs }, () => sync.liveSyncRunning, (r) => { sync.liveSyncRunning = r; }, (interval) => { sync.liveSyncInterval = interval; }, lastProcessedBlock, (b) => { lastProcessedBlock = b; }, () => sync.highestCommittedLeafIndex, (i) => { sync.highestCommittedLeafIndex = i; }, shouldPin, shouldProvide),
		stopLiveSync: () => stopLiveSync(sync.ws, (newWs) => { sync.ws = newWs }, () => sync.liveSyncInterval, (r) => { sync.liveSyncRunning = r; }, (interval) => { sync.liveSyncInterval = interval; }),
		syncBackwardsFromLatest: () => syncBackwardsFromLatest(ipfs, storage, ethereumHttpRpcUrl, contractAddress, (b) => { lastProcessedBlock = b; })
	}
	return sync
}
