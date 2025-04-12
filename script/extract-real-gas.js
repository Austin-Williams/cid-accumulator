import fs from 'fs'
import { execSync } from 'child_process'

const runJsonPath = './broadcast/GasProfile.s.sol/31337/run-latest.json'
const outputCsvPath = './script/gas_profile.csv'
const rpcUrl = 'http://127.0.0.1:8545'

const runData = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'))
const txs = runData.transactions.filter(tx => tx.transactionType === 'CALL')

const rows = []

txs.forEach((tx, i) => {
  const hash = tx.hash
  if (!hash) {
    rows.push('')
    return
  }

  try {
    const raw = execSync(`cast receipt ${hash} --rpc-url ${rpcUrl} --json`).toString()
    const receipt = JSON.parse(raw)
    const gasUsedHex = receipt.gasUsed
    const gasUsedDecimal = parseInt(gasUsedHex, 16) - 21831
    rows.push(gasUsedDecimal)
  } catch (err) {
    console.error(`❌ Failed to fetch gas for tx ${i} (${hash}):`, err.message)
    rows.push('')
  }
})

fs.writeFileSync(outputCsvPath, rows.join('\n'))
console.log(`✅ Real gas used (decimal only) written to: ${outputCsvPath}`)
