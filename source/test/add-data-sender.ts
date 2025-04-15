// add-data-sender.ts

import { ethers } from 'ethers'
import dotenv from 'dotenv'
import { base58btc } from 'multiformats/bases/base58'
import { CID } from 'multiformats/cid'
dotenv.config()

const RPC_URL = 'http://127.0.0.1:8545'
const INTERVAL_MS = 5000
const PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // from anvil test

const ExampleAbi = [
  'function addData(bytes calldata data) external',
  'function getLatestCID() public view returns (bytes)',
  'event NewData(uint32 leafIndex, bytes newData)'
]

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider)

  // Get the bytecode from the local compiled artifact
  const artifact = await import('../../out/Example.sol/Example.json', { assert: { type: 'json' } })
  const bytecode = artifact.default.bytecode.object || artifact.default.bytecode
  if (!bytecode) throw new Error('Missing bytecode in artifact')

  const factory = new ethers.ContractFactory(ExampleAbi, bytecode, wallet)
  const contractInstance = await factory.deploy()
  await contractInstance.waitForDeployment()
  const address = await contractInstance.getAddress()

  console.log('Deployed contract to:', address)
  console.log('Starting periodic addData calls to', address)

  const contract = new ethers.Contract(address, ExampleAbi, wallet)

  setInterval(async () => {
    try {
      const randomBytes = ethers.randomBytes(32)
      console.log('Sending randomBytes:', ethers.hexlify(randomBytes))

      const tx = await contract.addData(randomBytes)
      const receipt = await tx.wait()
      console.log('Mined in block:', receipt.blockNumber)

			const latestCIDHex: string = await contract.getLatestCID()
			const latestCIDBytes = ethers.getBytes(latestCIDHex)
			const cid = CID.decode(latestCIDBytes)
      console.log('New CID:', cid.toString())
    } catch (err) {
      console.error('Error submitting tx:', err)
    }
  }, INTERVAL_MS)
}

main().catch(console.error)