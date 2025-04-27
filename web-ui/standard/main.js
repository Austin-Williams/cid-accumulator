import { AccumulatorClient, defaultConfig } from "cid-accumulator-client";

// On page load, set sync and monitor status to initial values
window.addEventListener("DOMContentLoaded", () => {
  const syncState = document.getElementById("sync-state");
  const monitorState = document.getElementById("monitor-state");
  if (syncState) syncState.innerHTML = "&nbsp;";
  if (monitorState) {
    monitorState.textContent = "";
    monitorState.style.display = "none";
  }
});

const form = document.getElementById("client-form");


function log(msg) {
  // No-op: output element removed
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();


  const contractAddress = document.getElementById("contract-address").value;
  const config = {
    ...defaultConfig,
    ETHEREUM_HTTP_RPC_URL: document.getElementById("eth-http-url").value || defaultConfig.ETHEREUM_HTTP_RPC_URL,
    IPFS_GATEWAY_URL: document.getElementById("ipfs-gateway-url").value || defaultConfig.IPFS_GATEWAY_URL,
    IPFS_API_URL: document.getElementById("ipfs-api-url").value || defaultConfig.IPFS_API_URL,
  };


  log("Starting client...");
    // Show syncing status
  const syncState = document.getElementById("sync-state");
  const monitorState = document.getElementById("monitor-state");
  // Show the client started indicator
  const clientStartedIndicator = document.getElementById("client-started-indicator");
  if (clientStartedIndicator) clientStartedIndicator.style.display = "inline";
  if (syncState) syncState.textContent = "🔄 Syncing backwards...";
  if (monitorState) {
    monitorState.textContent = "";
    monitorState.style.display = "none";
  }
  try {
    const client = new AccumulatorClient(contractAddress, config);
    window.accumulatorClient = client;
    await client.start();
    // Mark as synced after start
    if (syncState) syncState.textContent = "🟢 Synced";
    log("Client started.");
    // Now show and poll the monitor state
    if (monitorState) {
      monitorState.style.display = "inline";
    }
    if (window._liveSyncPoll) clearInterval(window._liveSyncPoll);
    window._liveSyncPoll = setInterval(() => {
      if (!window.accumulatorClient || !window.accumulatorClient.sync) return;
      const running = window.accumulatorClient.sync.liveSyncRunning;
      if (monitorState) {
        monitorState.textContent = running
          ? "🟢 Monitoring blockchain for new events"
          : "🔴 Not monitoring blockchain for new events";
      }
    }, 1000);
  } catch (err) {
    log("Error: " + err.message);
  }
});
