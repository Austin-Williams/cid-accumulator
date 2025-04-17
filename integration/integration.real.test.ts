import "dotenv/config"
import { Pinner } from "../source/pinner/Pinner"
import { ethers } from "ethers"
// import Database from "better-sqlite3"
// import fs from "fs"
// import path from "path"
// import { fileURLToPath } from "url"

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)

async function main() {
  // const SUBMITTED_DATA_PATH = path.join(__dirname, "submitted-data.json")
  // const DB_PATH = process.env.TEST_DB_PATH || path.join(__dirname, "test-real.sqlite")
  const CONTRACT_ADDRESS = process.env.TEST_TARGET_CONTRACT_ADDRESS
  const PROVIDER_URL = process.env.TEST_RPC_PROVIDER_URL
  console.log("[integration test] Using provider URL:", PROVIDER_URL)

  if (!CONTRACT_ADDRESS || !PROVIDER_URL) {
    console.error("ERROR: Set TEST_TARGET_CONTRACT_ADDRESS and TEST_RPC_PROVIDER_URL in your environment.")
    process.exit(1)
  }

  // // Clean DB if exists
  // if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH)
  // const db = new Database(DB_PATH)

  // // Load submitted data
  // let submittedData: any[]
  // try {
  //   submittedData = JSON.parse(fs.readFileSync(SUBMITTED_DATA_PATH, "utf-8"))
  // } catch (e) {
  //   console.error("ERROR: Could not load submitted-data.json:", e)
  //   process.exit(1)
  // }

  // Setup provider and contract
  const provider = new ethers.JsonRpcProvider(PROVIDER_URL)
  const pinner = await Pinner.init(CONTRACT_ADDRESS, provider)
  // Swap DB to our test DB
  //pinner.db = db // this may be causing problems?

  // Sync all leaves with a small batch size to avoid provider issues
  console.log("[pinner] Syncing leaves from contract...")
  try {
    await pinner.syncForward({ logBatchSize: 100, endBlock: 8127295})
  } catch (err) {
    console.error('[integration test] Error during syncForward:', err)
    try {
      console.error('[integration test] Error details:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
    } catch (jsonErr) {
      console.error('[integration test] Could not stringify error:', jsonErr);
    }
    process.exit(1);
  }
  console.log('[test] Finished syncing forward')
  // // Check leaves
  // const rows = db.prepare("SELECT leaf_index, data FROM leaf_events ORDER BY leaf_index ASC").all()
  // if (rows.length !== submittedData.length) {
  //   console.error(`FAIL: Leaf count mismatch. DB has ${rows.length}, submitted-data.json has ${submittedData.length}`)
  //   process.exit(1)
  // }
  // let leavesOk = true
  // for (let i = 0; i < rows.length; i++) {
  //   const dbHex = Buffer.from(rows[i].data).toString("hex")
  //   if (dbHex !== submittedData[i].data) {
  //     console.error(`FAIL: Leaf data mismatch at index ${i}. DB: ${dbHex}, Expected: ${submittedData[i].data}`)
  //     leavesOk = false
  //   }
  // }
  // if (!leavesOk) {
  //   process.exit(1)
  // } else {
  //   console.log("PASS: All leaves match submitted-data.json")
  // }

  // // Check root CID
  // const contract = pinner.contract
  // const latestCID = await contract.getLatestCID()
  // const mmrRoot = (await pinner.mmr.rootCID()).toString()
  // if (latestCID !== mmrRoot) {
  //   console.error(`FAIL: Root CID mismatch. Contract: ${latestCID}, Pinner: ${mmrRoot}`)
  //   process.exit(1)
  // } else {
  //   console.log("PASS: Root CID matches contract")
  // }

  // console.log("Integration test completed successfully.")
  // process.exit(0)
}

main().catch(e => {
  console.error("ERROR:", e)
  process.exit(1)
})
