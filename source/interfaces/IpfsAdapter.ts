import { CID } from "../utils/CID.js"
import type { DagCborEncodedData } from "../types/types.js"

export interface IpfsAdapter {
	getBlock(cid: CID): Promise<DagCborEncodedData>
	putBlock(cid: CID, dagCborEncodedData: DagCborEncodedData): Promise<void>
	provide(cid: CID): Promise<void>
}
