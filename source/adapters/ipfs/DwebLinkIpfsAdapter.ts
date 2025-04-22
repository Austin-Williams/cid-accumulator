import { CID } from "../../utils/CID.js";
import type { IpfsAdapter } from "../../interfaces/IpfsAdapter.ts";

/**
 * DwebLinkIpfsAdapter: Read-only IPFS adapter for fetching blocks via dweb.link public gateway.
 * All write operations (put, pin, provide) are no-ops.
 */
export class DwebLinkIpfsAdapter implements IpfsAdapter {
  private gatewayUrl: string;

  constructor(gatewayUrl: string = "https://dweb.link/ipfs/") {
    this.gatewayUrl = gatewayUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  /**
   * Get a block by CID from IPFS via dweb.link.
   */
  async get(cid: CID<unknown, 113, 18, 1>): Promise<Uint8Array> {
    // dweb.link expects: https://dweb.link/ipfs/{CID}
    const url = `${this.gatewayUrl}/${cid.toString()}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`dweb.link get failed: ${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /**
   * No-op: dweb.link does not support writing blocks.
   */
  async put(_cid: CID<unknown, 113, 18, 1>, _data: Uint8Array): Promise<void> {
    // No-op
    return;
  }

  /**
   * No-op: dweb.link does not support pinning.
   */
  async pin(_cid: CID<unknown, 113, 18, 1>): Promise<void> {
    // No-op
    return;
  }

  /**
   * No-op: dweb.link does not support providing blocks.
   */
  async provide(_cid: CID<unknown, 113, 18, 1>): Promise<void> {
    // No-op
    return;
  }
}
