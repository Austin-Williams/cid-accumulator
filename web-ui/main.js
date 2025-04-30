import { AccumulatorClient, defaultConfig } from "cid-accumulator-client"

// On page load, set sync and monitor status to initial values
window.addEventListener("DOMContentLoaded", () => {
	const syncState = document.getElementById("sync-state")
	const monitorState = document.getElementById("monitor-state")
	if (syncState) syncState.innerHTML = "&nbsp;"
	if (monitorState) {
		monitorState.textContent = ""
		monitorState.style.display = "none"
	}
})

const form = document.getElementById("client-form")

/**
 * Displays a new event in the live events box
 * @param {string} str - The event text to display
 */
function displayNewLiveEvent(str) {
	const liveEventsBox = document.getElementById("live-events")
	if (!liveEventsBox) return;
	
	// Add timestamp and format the event
	const timestamp = new Date().toLocaleTimeString()
	const formattedEvent = `[${timestamp}] ${str}`
	
	// Append the new event to the existing content
	liveEventsBox.textContent = liveEventsBox.textContent 
		? liveEventsBox.textContent + "\n" + formattedEvent
		: formattedEvent
	
	// Auto-scroll to the bottom
	liveEventsBox.scrollTop = liveEventsBox.scrollHeight
}


form.addEventListener("submit", async (e) => {
	e.preventDefault()

	// Use placeholder as default if no address entered
	const contractInput = document.getElementById("contract-address");
	const contractAddress = (contractInput.value || contractInput.placeholder).trim()
	// Parse max block range input as number, or set to 250 if blank
	const maxBlockRangeInput = document.getElementById("eth-max-block-range").value
	const maxBlockRange = maxBlockRangeInput ? parseInt(maxBlockRangeInput, 10) : 250

	const config = {
		...defaultConfig,
		// Ethereum options
		ETHEREUM_HTTP_RPC_URL: document.getElementById("eth-http-url").value || defaultConfig.ETHEREUM_HTTP_RPC_URL,
		ETHEREUM_MAX_BLOCK_RANGE_PER_HTTP_RPC_CALL: maxBlockRange,
		ETHEREUM_WS_RPC_URL: document.getElementById("eth-ws-url").value || defaultConfig.ETHEREUM_WS_RPC_URL,
		// IPFS options
		IPFS_GATEWAY_URL: document.getElementById("ipfs-gateway-url").value || defaultConfig.IPFS_GATEWAY_URL,
		IPFS_API_URL: document.getElementById("ipfs-api-url").value || defaultConfig.IPFS_API_URL,
		IPFS_PUT_IF_POSSIBLE: document.getElementById("ipfs-put-if-possible").checked,
		IPFS_PIN_IF_POSSIBLE: document.getElementById("ipfs-pin-if-possible").checked,
		IPFS_PROVIDE_IF_POSSIBLE: document.getElementById("ipfs-provide-if-possible").checked,
		// Advanced options
		GET_ROOT_CID_CALLDATA_OVERRIDE: document.getElementById("get-root-cid-override").value || undefined,
		GET_STATE_CALLDATA_OVERRIDE: document.getElementById("get-state-override").value || undefined,
		LEAF_APPENDED_EVENT_SIGNATURE_OVERRIDE: document.getElementById("leaf-appended-event-override").value || undefined,
	}

	// Show syncing status
	const syncState = document.getElementById("sync-state")
	const monitorState = document.getElementById("monitor-state")
	// Show the client started indicator
	const clientStartedIndicator = document.getElementById("client-started-indicator")
	if (clientStartedIndicator) clientStartedIndicator.style.display = "inline"
	if (syncState) syncState.textContent = "🔄 Syncing backwards..."
	if (monitorState) {
		monitorState.textContent = ""
		monitorState.style.display = "none"
	}
	try {
		const client = new AccumulatorClient(contractAddress, config)
		window.client = client
		await window.client.start()
		// Mark as synced after start
		if (syncState) syncState.textContent = "🟢 Synced"
		// Enable Download Data button now that we're synced
		const downloadBtn = document.getElementById("download-data-btn")
		if (downloadBtn) downloadBtn.disabled = false
		// Subscribe to live events
		window.client.data.subscribe((index, bytes) => {
			const displayText = `New data: index: ${index}, bytes: ${bytes}`
			displayNewLiveEvent(displayText)
		})
		// Now show and poll the monitor state
		if (monitorState) {
			monitorState.style.display = "inline"
		}
		if (window._liveSyncPoll) clearInterval(window._liveSyncPoll)
		window._liveSyncPoll = setInterval(() => {
			if (!window.client || !window.client.sync) return
			const running = window.client.sync.liveSyncRunning
			const liveEventsContainer = document.getElementById("live-events-container")
			
			if (monitorState) {
				monitorState.textContent = running
					? "🟢 Monitoring blockchain for new events"
					: "🔴 Not monitoring blockchain for new events"
				
				// Show live events container only when actively monitoring blockchain
				if (liveEventsContainer) {
					liveEventsContainer.style.display = running ? "block" : "none"
				}
			}
		}, 1000)
	} catch (err) {
		console.error("Error:", err)
	}
})

// Attach Download Data click handler
const downloadBtn = document.getElementById("download-data-btn")
if (downloadBtn) {
		downloadBtn.addEventListener("click", async () => {
				if (!window.client || !window.client.data) {
						console.error("Client not initialized.")
						return
				}
				downloadBtn.disabled = true
				try {
						await window.client.data.downloadAll()
						displayNewLiveEvent("Downloaded all data.")
				} catch (err) {
						console.error("Download error:", err)
						displayNewLiveEvent("Error downloading data. See console.")
				} finally {
						downloadBtn.disabled = false
				}
		})
}

// Attach Delete IndexedDB click handler
const deleteDbBtn = document.getElementById("delete-db-btn")
if (deleteDbBtn) {
	deleteDbBtn.addEventListener("click", async () => {
		// Shutdown client if running
		if (window.client && typeof window.client.shutdown === "function") {
			try {
				await window.client.shutdown()
			} catch (err) {
				console.error("Error during client shutdown:", err)
			}
		}
		// Clear the 'kv' store and reload
		const openReq = indexedDB.open("cid-accumulator")
		openReq.onsuccess = (event) => {
			const db = event.target.result;
			const tx = db.transaction("kv", "readwrite")
			const store = tx.objectStore("kv")
			const clearReq = store.clear()
			clearReq.onsuccess = () => {
				db.close()
				location.reload()
			}
			clearReq.onerror = () => {
				console.error("Failed to clear kv store")
				db.close()
				location.reload()
			}
		}
		openReq.onerror = () => {
			console.error("Failed to open cid-accumulator DB")
			location.reload()
		}
	})
}
