// browserExample.ts: Browser-friendly version of example.ts
// Run this with Vite or similar browser bundler

import { AccumulatorClient } from "./source/accumulator/AccumulatorClient.ts";
import { ReadOnlyIpfsAdapter } from "./source/adapters/ipfs/ReadOnlyIpfsAdapter.ts";
import { IndexedDBAdapter } from "./source/adapters/storage/IndexedDBAdapter.ts";
import { config } from "./config.ts"

async function main() {
  // Set up read-only IPFS adapter for public gateway
  // You can use dweb.link, ipfs.io, or any compatible public gateway
  const ipfs = new ReadOnlyIpfsAdapter(config.IPFS_API_URL);

  // Set up persistent browser storage adapter
  const storage = new IndexedDBAdapter();

  // Instantiate the node
  const accumulatorClient = new AccumulatorClient({ ...config, ipfs, storage });

  // Initialize the node
  await accumulatorClient.init();

  // Sync backwards from the latest leaf insert
  await accumulatorClient.syncBackwardsFromLatest();

  // Rebuild the Merkle Mountain Range and pin all related data to IPFS
  await accumulatorClient.rebuildAndProvideMMR();

	await accumulatorClient.startLiveSync();

  // Log successful completion
  console.log("\u{2705} Browser example completed successfully");

  // You can add more browser-friendly UI hooks here
  console.log("\u{2705} Browser example completed successfully");
}

main().catch((e) => {
  // In browser, process.exit is not available
  console.error("\u{274C} Browser example runner error:", e);
});
