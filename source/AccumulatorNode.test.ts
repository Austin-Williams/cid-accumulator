import { AccumulatorNode } from "./AccumulatorNode"
import { ethers } from "ethers"
import { CID } from "multiformats/cid"
import { createIpfsAdapter } from "./adapters/ipfs/mockIpfsAdapter" // Replace with your real or mock adapter
import { createSqliteAdapter } from "./adapters/storage/SqliteAdapter" // Replace with your real or mock adapter

// --- CONFIGURE THESE FOR YOUR ENVIRONMENT ---
const RPC_URL = process.env.RPC_URL || "<YOUR_RPC_URL>"
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "<YOUR_CONTRACT_ADDRESS>"

async function main() {
  // Set up provider and contract
  const provider = new ethers.JsonRpcProvider(RPC_URL)
  const abi = require("./shared/abi.json") // Make sure ABI is available
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider)

  // Set up adapters
  const ipfs = createIpfsAdapter() // Use your real or mock implementation
  const storage = await createSqliteAdapter(":memory:") // Or point to a file for persistence

  // Instantiate the node
  const node = new AccumulatorNode({ ipfs, storage, contract })

  // Run the backwards sync
  try {
    await node.syncBackwardsFromLatest(1000)
    console.log("Sync complete!")
  } catch (e) {
    console.error("Sync failed:", e)
  }
}

main().catch(console.error)
