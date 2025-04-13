import { ethers } from 'ethers'
import { createHelia } from "helia"
import type { Helia } from '@helia/interface'
import { MerkleMountainRange } from './utils/ipfs.ts'
import dotenv from 'dotenv'
dotenv.config()

const RPC_URL = 'http://127.0.0.1:8545'
const provider = new ethers.JsonRpcProvider(RPC_URL)

const TARGET_CONTRACT_ADDRESS = process.argv[2]
if (!TARGET_CONTRACT_ADDRESS) {
	throw new Error('Usage: npx --no-install tsx ./source/data-indexer.ts <TARGET_CONTRACT_ADDRESS>')
}

const ABI = [ 'event NewData(uint32 leafIndex, bytes newData)' ]

async function main() {
	const helia: Helia = await createHelia()
	const blockstore = helia.blockstore
	const MMR = new MerkleMountainRange(blockstore)

	const contract = new ethers.Contract(TARGET_CONTRACT_ADDRESS, ABI, provider)

	// 1. Fetch past logs and process them
	console.log('Looking for past NewData events from', TARGET_CONTRACT_ADDRESS)
	const pastLogs = await contract.queryFilter('NewData', 0, 'latest')
	console.log(`📜 Found ${pastLogs.length} past NewData events. Processing...`)
	const iface = new ethers.Interface(ABI)
	for (const event of pastLogs) {
		const decoded = iface.decodeEventLog('NewData', event.data, event.topics)
		const leafIndex = Number(decoded.leafIndex)
		const leafData = decoded.newData as string
		const leafBytes = ethers.getBytes(leafData)
		await MMR.addLeaf(leafBytes, leafIndex)
	}
	console.log(`Processed all past events.\nLatest CID: ${await MMR.rootCID()}`)

	// 2. Process live events
	console.log(`Listening for new events...`)
	let liveProcessing = Promise.resolve()

	contract.on('NewData', (leafIndexRaw: bigint, newData: string) => {
		const thisTask = async () => {
			try {
				const leafIndex = Number(leafIndexRaw)
				console.log(`Processing new leaf with index: ${leafIndex}`)
				const leafBytes = ethers.getBytes(newData)
				await MMR.addLeaf(leafBytes, leafIndex)
				const cid = await MMR.rootCID()
				console.log(`Latest CID: ${cid.toString()}`)
				console.log(`Listening for new events...`)
			} catch (err) {
				console.error('❌ Error in event handler:', err)
			}
		}
		// Chain the new task onto the previous one
		liveProcessing = liveProcessing.then(thisTask)
	})
}

main().catch(console.error)
