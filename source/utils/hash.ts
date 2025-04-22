// Cross-platform SHA-256 hashing utility
// Uses Web Crypto API in browser, Node.js crypto in Node
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // Browser: Web Crypto API
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(hashBuffer);
  }
  // Node.js: built-in crypto
  if (typeof process !== "undefined" && process.versions?.node) {
    const { createHash } = await import("crypto");
    const hash = createHash("sha256");
    hash.update(Buffer.from(data));
    return new Uint8Array(hash.digest());
  }
  throw new Error("No suitable crypto implementation found");
}
