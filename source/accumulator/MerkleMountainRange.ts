import { CID } from "multiformats/cid"
import { encodeBlock } from "../utils/codec.ts"
import { MMRLeafInsertTrail } from "../types/types.ts"

export class MerkleMountainRange {
	public peaks: CID[] = []
	public leafCount = 0

	constructor() {}

	/**
	 * Adds a new leaf to the MMR and computes all intermediate nodes.
	 * @param newData - The raw data for the new leaf node to be added.
	 * @param leafIndex - The expected leaf index for the new leaf.
	 * @returns An array of CID and data pairs for leaf, all intermediate nodes, and the root
	 */
	async addLeafWithTrail(leafIndex: number, newData: Uint8Array): Promise<MMRLeafInsertTrail> {
		if (this.leafCount !== leafIndex) throw new Error(`Expected leafIndex ${this.leafCount} but got ${leafIndex}`)

		const trail: MMRLeafInsertTrail = []

		const { cid: leafCID, bytes: leafData } = await encodeBlock(newData)
		trail.push({ cid: leafCID, data: leafData })

		let newPeak = leafCID
		let height = 0

		while ((this.leafCount >> height) & 1) {
			const left = this.peaks.pop()
			if (!left) throw new Error("MMR structure error: no peak to merge")

			const { cid: merged, bytes } = await encodeBlock({ L: left, R: newPeak })
			trail.push({ cid: merged, data: bytes })

			newPeak = merged
			height++
		}

		this.peaks.push(newPeak)
		this.leafCount++

		const peakBaggingInfo = await this.rootCIDWithTrail()
		trail.push(...peakBaggingInfo.trail)

		return trail
	}

	async rootCIDWithTrail(): Promise<{
		root: CID
		cids: string[] // TODO: redundant, remove
		data: Uint8Array[] // TODO: redundant, remove
		trail: { cid: CID; data: Uint8Array }[]
	}> {
		const cids: string[] = []
		const data: Uint8Array[] = []
		const trail: { cid: CID; data: Uint8Array }[] = []

		if (this.peaks.length === 0) {
			const empty = CID.parse("bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku")
			return { root: empty, cids: [], data: [], trail: [] }
		}

		if (this.peaks.length === 1) {
			return { root: this.peaks[0], cids: [], data: [], trail: [] }
		}

		let current = this.peaks[0]
		for (let i = 1; i < this.peaks.length; i++) {
			const { cid, bytes } = await encodeBlock({ L: current, R: this.peaks[i] })
			trail.push({ cid: cid, data: bytes })
			cids.push(cid.toString())
			data.push(bytes)
			current = cid
		}

		return { root: current, cids, data, trail }
	}

	async rootCID(): Promise<CID> {
		const result = await this.rootCIDWithTrail()
		return result.root
	}

	async rootCIDAsBase32(): Promise<string> {
		const cid = await this.rootCID()
		return cid.toString()
	}
}
