import { AccumulatorClient, defaultConfig } from "cid-accumulator-client";

const form = document.getElementById("client-form");
const output = document.getElementById("output");
const clearDbBtn = document.getElementById("clear-db-btn");

function log(msg) {
  output.textContent += msg + "\n";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  output.textContent = "";

  const contractAddress = document.getElementById("contract-address").value;
  const config = {
    ...defaultConfig,
    ETHEREUM_HTTP_RPC_URL: document.getElementById("eth-http-url").value,
    IPFS_GATEWAY_URL: document.getElementById("ipfs-gateway-url").value,
    IPFS_API_URL: document.getElementById("ipfs-api-url").value || undefined,
  };

  log("Starting client...");
  try {
    const client = new AccumulatorClient(contractAddress, config);
    window.accumulatorClient = client; // for debugging in console
    await client.start();
    log("Client started and synced!");
  } catch (err) {
    log("Error: " + err.message);
  }
});

clearDbBtn.addEventListener("click", async () => {
  log("Clearing local DB...");
  try {
    // Try to gracefully shutdown if client exists
    if (window.accumulatorClient && typeof window.accumulatorClient.shutdown === "function") {
      await window.accumulatorClient.shutdown();
      log("Client shut down.");
    }
    // Attempt to delete IndexedDB used by the client
    // Default DB name is 'accumulator-client-db' unless overridden
    const dbName = "accumulator-client-db";
    const req = window.indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => log("Local DB cleared (IndexedDB deleted).");
    req.onerror = (e) => log("Error clearing DB: " + e.target.error);
    req.onblocked = () => log("DB deletion blocked. Please close other tabs using this site.");
  } catch (err) {
    log("Error clearing DB: " + err.message);
  }
});
