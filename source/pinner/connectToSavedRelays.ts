import fs from "fs/promises"
import path from "path"
import { multiaddr } from "@multiformats/multiaddr"

/**
 * Loads relay addresses from the relays.json file and connects to them using the provided libp2p instance.
 * @param libp2p The libp2p instance (e.g., helia.libp2p)
 * @param relaysFile Optional path to relays.json
 */
export async function connectToSavedRelays(libp2p: any, relaysFile?: string) {
	const defaultRelaysFile = path.join(".pinner", "ipfsPublicRelays", "relays.json")
	const file = relaysFile || defaultRelaysFile
	let relays: string[] = []
	try {
		const data = await fs.readFile(file, "utf8")
		relays = JSON.parse(data)
		if (!Array.isArray(relays)) relays = []
	} catch {
		console.warn(`[relay-connect] Could not read relays file: ${file}`)
		return
	}
	for (const addrStr of relays) {
		try {
			const addr = multiaddr(addrStr)
			console.log(`[relay-connect] Connecting to relay: ${addrStr}`)
			await libp2p.dial(addr)
			console.log(`[relay-connect] Connected to relay: ${addrStr}`)
		} catch (e) {
			console.warn(`[relay-connect] Failed to connect to relay: ${addrStr}`, e)
		}
	}
}
