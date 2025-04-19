import { CID } from "multiformats/cid"

export interface IpfsAdapter {
	get(cid: CID<unknown, 113, 18, 1>): Promise<Uint8Array>
	put(cid: CID<unknown, 113, 18, 1>, data: Uint8Array): Promise<void>
	pin(cid: CID<unknown, 113, 18, 1>): Promise<void>
	provide(cid: CID<unknown, 113, 18, 1>): Promise<void>
}
