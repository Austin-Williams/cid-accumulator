import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import type { StorageAdapter } from "../../interfaces/StorageAdapter.ts"
import type { DagCborEncodedData, IpfsNamespace } from "../../types/types.ts"
import type { CID } from "../../utils/CID.ts"
import { getAndResolveCID, rePinAllDataToIPFS, putPinProvideToIPFS } from "./ipfsHelpers.ts"

export function getIpfsNamespace(
	ipfs: IpfsAdapter,
	storageAdapter: StorageAdapter,
	shouldPut: boolean,
	shouldPin: boolean,
	shouldProvide: boolean,
): IpfsNamespace {
	return {
		ipfsAdapter: ipfs,
		shouldPut,
		shouldPin,
		shouldProvide,
		getAndResolveCID: (cid: CID<unknown, 113, 18, 1>, opts?: { signal?: AbortSignal }) =>
			getAndResolveCID(ipfs, storageAdapter, cid, opts),
		rePinAllDataToIPFS: () => rePinAllDataToIPFS(ipfs, storageAdapter, shouldPut, shouldPin, shouldProvide),
		putPinProvideToIPFS: (cid: CID<unknown, 113, 18, 1>, dagCborEncodedData: DagCborEncodedData) =>
			putPinProvideToIPFS(ipfs, shouldPut, shouldProvide, cid, dagCborEncodedData),
	}
}
