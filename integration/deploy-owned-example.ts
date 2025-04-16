import 'dotenv/config'
import { ethers } from 'ethers'
import fs from 'fs/promises'
import path from 'path'

const CONTRACT_ABI_PATH = path.resolve(__dirname, '../source/contracts/abi/OwnedExample.json')
const CONTRACT_BIN_PATH = path.resolve(__dirname, '../source/contracts/abi/OwnedExample.bin')
const OUTPUT_PATH = path.resolve(__dirname, './deployed-owned-example.json')

async function main() {
  const providerUrl = process.env.TEST_RPC_PROVIDER_URL
  const mnemonic = process.env.TEST_MNEMONIC_FOR_SUBMITTER
  if (!providerUrl || !mnemonic) {
    throw new Error('Missing env: RPC_PROVIDER_URL or MNEMONIC_FOR_SUBMITTER')
  }

  const abi = JSON.parse(await fs.readFile(CONTRACT_ABI_PATH, 'utf8'))
  let bytecode: string
  try {
    bytecode = (await fs.readFile(CONTRACT_BIN_PATH, 'utf8')).trim()
  } catch {
    throw new Error('Missing OwnedExample.bin (compiled bytecode). Please compile the contract.')
  }

  const provider = new ethers.JsonRpcProvider(providerUrl)
  const wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider)
  const factory = new ethers.ContractFactory(abi, bytecode, wallet)

  console.log('Deploying OwnedExample...')
  const contract = await factory.deploy()
  await contract.waitForDeployment()
  const address = await contract.getAddress()
  console.log('Deployed to:', address)

  await fs.writeFile(OUTPUT_PATH, JSON.stringify({ address }, null, 2))
  console.log('Deployment info saved to', OUTPUT_PATH)
}

main().catch(e => { console.error(e); process.exit(1) })
