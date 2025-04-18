
import { createHelia } from 'helia'
import { unixfs } from '@helia/unixfs'
import { MemoryBlockstore } from 'blockstore-core'
import { MemoryDatastore } from 'datastore-core'
import { FsBlockstore } from 'blockstore-fs'
import { FsDatastore } from 'datastore-fs'
import { CID } from 'multiformats/cid'
import path from 'path'

export interface HeliaNodeController {
  helia: any,
  fs: ReturnType<typeof unixfs>,
  stop: () => Promise<void>
}

/**
 * Creates a Helia node with either persistent (filesystem) or in-memory blockstore/datastore.
 * @param isPersistent - If true, use filesystem-backed stores; otherwise, use in-memory.
 * @param storageDir - Optional directory for persistent storage (default: './.pinner/helia')
 */
export async function startHeliaNode(isPersistent: boolean, storageDir = './.pinner/helia'): Promise<HeliaNodeController> {
  let blockstore, datastore
  if (isPersistent) {
    const blocksPath = path.join(storageDir, 'blocks')
    const datastorePath = path.join(storageDir, 'datastore')
    blockstore = new FsBlockstore(blocksPath)
    datastore = new FsDatastore(datastorePath)
  } else {
    blockstore = new MemoryBlockstore()
    datastore = new MemoryDatastore()
  }
  const helia = await createHelia({ blockstore, datastore })
  const fs = unixfs(helia)
  return {
    helia,
    fs,
    stop: async () => { await helia.stop() }
  }
}

/**
 * Adds and pins data to Helia, and provides it to the DHT.
 * @param fs - UnixFS API from Helia
 * @param pinner - Pinning API from Helia
 * @param helia - Helia node
 * @param data - Data to add (Uint8Array)
 * @param metadata - Optional pin metadata
 * @returns CID of the added data
 */
export async function addAndPinData({ fs, helia, data, metadata }: {
  fs: ReturnType<typeof unixfs>,
  helia: Awaited<ReturnType<typeof createHelia>>,
  data: Uint8Array,
  metadata?: Record<string, any>
}): Promise<CID> {
  const cid = await fs.addBytes(data)
  // Pin with metadata using helia.pins
  for await (const pinnedCid of helia.pins.add(cid, { metadata })) {
    // Pinning output (optional)
  }
  await helia.routing.provide(cid)
  return cid
}

