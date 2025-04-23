import { CID } from "../../utils/CID.ts"
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts"
import { isBrowser } from "../../utils/envDetection.ts"
import { verifyCIDAgainstDagCborEncodedData, verifyCIDAgainstDagCborEncodedDataOrThrow } from "../../utils/verifyCID.ts"
import { DagCborEncodedData } from "../../types/types.ts"

/**
 * FetchIpfsAdapter implements IpfsAdapter using raw fetch calls to the IPFS HTTP API (Kubo-compatible).
 * No external dependencies required except fetch (native in Node >=18).
 */
export class UniversalIpfsAdapter implements IpfsAdapter {
	private gatewayUrl: string
	private apiUrl: string | undefined
	private shouldPut: boolean
	private shouldPin: boolean
	private shouldProvide: boolean

	constructor(
		gatewayUrl: string,
		apiUrl: string | undefined,
		wantsToPut: boolean,
		wantsToPin: boolean,
		wantsToProvide: boolean,
	) {
		this.gatewayUrl = gatewayUrl.replace(/\/$/, "") // Remove trailing slash
		this.apiUrl = apiUrl?.replace(/\/$/, "") // Remove trailing slash
		this.shouldPut = (wantsToPut) && (apiUrl !== undefined)
		this.shouldPin = (wantsToPin) && (apiUrl !== undefined)
		this.shouldProvide = (wantsToProvide) && (apiUrl !== undefined) && (!isBrowser())
	}
	/**
	 * Get a block by CID from IPFS.
	 */
	async getBlock(cid: CID<unknown, 113, 18, 1>): Promise<DagCborEncodedData> {
		const url = `${this.gatewayUrl}/ipfs/${cid.toString()}`
		const res = await fetch(url, { method: "GET" })
		if (!res.ok) throw new Error(`IPFS block/get failed: ${res.status} ${res.statusText}`)
		const data: DagCborEncodedData = (new Uint8Array(await res.arrayBuffer())) as DagCborEncodedData
		
		// Verify that we actually got what we asked for
		await verifyCIDAgainstDagCborEncodedDataOrThrow(
			data,
			cid,
			`[UniversalIpfsAdapter.getBlock] 🚨 IPFS Gateway returned invalid data!`
		)

		return data
	}

	/**
	 * Put a block (dag-cbor, sha2-256, CIDv1) to IPFS. Pinning is optional, controlled by config.
	 * Note: The CID is not used directly; IPFS computes it from the data.
	 */
	async putBlock(cid: CID<unknown, 113, 18, 1>, dagCborEncodedData: DagCborEncodedData): Promise<void> {
		if (!verifyCIDAgainstDagCborEncodedData(dagCborEncodedData, cid)) {
			console.warn(`[UniversalIpfsAdapter.putBlock] ‼️ CID/Data pair is invalid. dagCborEncodedData: ${dagCborEncodedData}, expectedCID: ${cid.toString()}`)
		}
		if (!this.shouldPut) return

		const url = `${this.apiUrl}/api/v0/block/put?format=dag-cbor&mhtype=sha2-256&pin=${this.shouldPin}`
		const form = new FormData()
		form.append("data", new Blob([dagCborEncodedData]))
		const res = await fetch(url, {
			method: "POST",
			body: form,
			// fetch sets Content-Type for multipart automatically
		})
		if (!res.ok) throw new Error(`IPFS block/put failed: ${res.status} ${res.statusText}`)

		// Verify returned CID
		const response = await res.json()
		const returnedCid = CID.parse(response.Key)
		if (returnedCid.toString() !== cid.toString()) {
			console.warn(`[UniversalIpfsAdapter.putBlock] ‼️ CID returned by the IPFS API was ${returnedCid.toString()} but you expected ${cid.toString()}`)
		}
	}

	/**
	 * Provide a CID to the DHT (optional, fire-and-forget).
	 */
	async provide(cid: CID<unknown, 113, 18, 1>): Promise<void> {
		if (!this.shouldProvide) return
		const url = `${this.apiUrl}/api/v0/dht/provide?arg=${cid.toString()}`
		// Fire and forget; don't block on the result
		fetch(url).catch(() => {})
	}
}
