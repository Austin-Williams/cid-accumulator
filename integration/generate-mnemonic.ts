import { ethers } from 'ethers'
import fs from 'fs/promises'
import path from 'path'

async function main() {
  // Generate a random mnemonic
  const wallet = ethers.Wallet.createRandom()
  const mnemonic = wallet.mnemonic?.phrase || ''
  const address = await wallet.getAddress()

  // Path to .env in project root
  const envPath = path.resolve(__dirname, '../.env')
  let envContent = ''
  try {
    envContent = await fs.readFile(envPath, 'utf8')
  } catch {
    // If .env doesn't exist, start with empty
    envContent = ''
  }

  // Replace or add TEST_MNEMONIC_FOR_SUBMITTER in .env
  const line = `TEST_MNEMONIC_FOR_SUBMITTER="${mnemonic}"
`
  if (/^TEST_MNEMONIC_FOR_SUBMITTER=/m.test(envContent)) {
    envContent = envContent.replace(/^TEST_MNEMONIC_FOR_SUBMITTER=.*$/m, line.trim())
  } else {
    if (!envContent.endsWith('\n')) envContent += '\n'
    envContent += line
  }
  await fs.writeFile(envPath, envContent)

  console.log('Generated mnemonic and wrote to .env as TEST_MNEMONIC_FOR_SUBMITTER.')
  console.log('First account address:', address)
}

main().catch(e => { console.error(e); process.exit(1) })
