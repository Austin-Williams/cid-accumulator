import { CID } from "multiformats/cid"
import { encodeBlock } from "./shared/codec.ts"

/**
 * Computes the root CID from an array of peak CIDs, left-to-right bagging (canonical MMR logic).
 * @param peaks Array of CIDs (left-to-right order)
 * @returns The root CID (or the zero CID if peaks is empty)
 */
export async function getRootCIDFromPeaks(peaks: CID[]): Promise<CID> {
	if (peaks.length === 0) {
		return CID.parse("bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku")
	}
	if (peaks.length === 1) {
		return peaks[0]
	}
	let current = peaks[0]
	for (let i = 1; i < peaks.length; i++) {
		const { cid } = await encodeBlock({ L: current, R: peaks[i] })
		current = cid
	}
	return current
}
