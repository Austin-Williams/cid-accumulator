// Universal Buffer/Uint8Array helpers for browser & Node

/**
 * Convert a hex string (with or without 0x prefix) to Uint8Array.
 */
export function hexToUint8Array(hex: string): Uint8Array {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.length % 2) hex = "0" + hex;
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; ++i) {
    arr[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  }
  return arr;
}

/**
 * Convert Uint8Array to hex string (with 0x prefix).
 */
export function uint8ArrayToHex(arr: Uint8Array): string {
  return "0x" + Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
}
