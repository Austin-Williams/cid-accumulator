import { promptUserChoice } from '../shared/userPrompt.js'
import { Pinner } from './Pinner.js'
import { ethers } from 'ethers'
import { getAccumulatorData } from '../shared/accumulator.js'

async function main() {
	// prompt user for target contract and provider url
	let contractAddress = await promptUserChoice('Enter the target contract address: ', [], false);
	if (!(contractAddress && contractAddress.startsWith('0x') && contractAddress.length === 42)) {
		throw new Error('Invalid Ethereum address.');
	}
	let providerUrl = await promptUserChoice("Enter the provider URL (default: 'http://127.0.0.1:8545'): ", [], false);
	providerUrl = providerUrl.trim() || 'http://127.0.0.1:8545';

	// set up the pinner
	const provider = new ethers.JsonRpcProvider(providerUrl)
	const pinner = await Pinner.init(contractAddress, provider)
	await pinner.prepareDB()
	console.log(`Pinner has synced up to leaf index ${pinner.syncedToLeafIndex}`)

	// see how far ahead the accumulator is from the pinner
	const accData = await getAccumulatorData(provider, contractAddress)
	console.log(`Latest leaf index on-chain: ${accData.leafCount}`)
	console.log(`You are ${accData.leafCount - (pinner.syncedToLeafIndex ?? 0)} behind.`)

	if (pinner.syncedToLeafIndex! < accData.leafCount) {
		const answer = await promptUserChoice(
			'Options:\n'
			+ '1. Sync from here\n'
			+ '2. Check for more recent data pinned to IPFS\n'
			+ '3. Abort\n'
			+ 'Enter your choice (1/2/3): ',
			['1', '2', '3']
		)

		if (answer === '1') {
			console.log('Syncing from current index...');
			// TODO: Add sync logic here
		} else if (answer === '2') {
			console.log('Checking for more recent data on IPFS...');
			// TODO: Add IPFS check logic here
		} else {
			console.log('Aborting operation.');
			process.exit(0);
		}
	} else {
		// TODO: Start watching for new events
	}
}

main()
