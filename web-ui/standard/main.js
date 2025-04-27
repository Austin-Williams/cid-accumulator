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

/**
 * Displays a new event in the live events box
 * @param {string} str - The event text to display
 */
function displayNewLiveEvent(str) {
	const liveEventsBox = document.getElementById("live-events");
	if (!liveEventsBox) return;
	
	// Add timestamp and format the event
	const timestamp = new Date().toLocaleTimeString();
	const formattedEvent = `[${timestamp}] ${str}`;
	
	// Append the new event to the existing content
	liveEventsBox.textContent = liveEventsBox.textContent 
		? liveEventsBox.textContent + "\n" + formattedEvent
		: formattedEvent;
	
	// Auto-scroll to the bottom
	liveEventsBox.scrollTop = liveEventsBox.scrollHeight;
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
		window.client = client;
		await window.client.start();
		// Mark as synced after start
		if (syncState) syncState.textContent = "🟢 Synced";
		// Subscribe to live events
		window.client.data.subscribe((index, bytes) => {
			const displayText = `New data added: index: ${index}, bytes: ${bytes}`
			displayNewLiveEvent(displayText);
		})
		// Now show and poll the monitor state
		if (monitorState) {
			monitorState.style.display = "inline";
		}
		if (window._liveSyncPoll) clearInterval(window._liveSyncPoll);
		window._liveSyncPoll = setInterval(() => {
			if (!window.client || !window.client.sync) return;
			const running = window.client.sync.liveSyncRunning;
			const liveEventsContainer = document.getElementById("live-events-container");
			
			if (monitorState) {
				monitorState.textContent = running
					? "🟢 Monitoring blockchain for new events"
					: "🔴 Not monitoring blockchain for new events";
				
				// Show live events container only when actively monitoring blockchain
				if (liveEventsContainer) {
					liveEventsContainer.style.display = running ? "block" : "none";
				}
			}
		}, 1000);
	} catch (err) {
		console.error("Error:", err);
	}
})
