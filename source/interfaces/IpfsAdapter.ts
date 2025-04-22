import { CID } from "../utils/CID.js"

export interface IpfsAdapter {
	get(cid: CID): Promise<Uint8Array>
	put(cid: CID, data: Uint8Array): Promise<void>
	pin(cid: CID): Promise<void>
	provide(cid: CID): Promise<void>
}
