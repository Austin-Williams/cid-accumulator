// envDetection.ts: Utility to detect runtime environment

/**
 * Returns true if running in a browser (window, document, navigator are defined).
 */
export function isBrowser(): boolean {
	return typeof window !== "undefined" && typeof window.document !== "undefined"
}

/**
 * Returns true if running in Node.js (process, global, require are defined).
 */
export function isNodeJs(): boolean {
	return typeof process !== "undefined" && !!(process.versions && process.versions.node)
}
