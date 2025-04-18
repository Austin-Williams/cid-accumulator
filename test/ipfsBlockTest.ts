import { create as createKuboClient } from 'kubo-rpc-client';
import * as dagCbor from '@ipld/dag-cbor';
import { randomBytes } from 'crypto';
import { CID } from 'multiformats/cid';

async function main() {
  // 1. Generate 32 random bytes
  const data = randomBytes(32);
  // 2. DAG-CBOR encode as a simple object (CBOR requires an object root)
  const encoded = dagCbor.encode({ data });

  // 3. Connect to local IPFS node
  const ipfs = createKuboClient({ url: 'http://127.0.0.1:5001/api/v0' });

  // 4. Add the block
  const putRes = await ipfs.block.put(encoded, { mhtype: 'sha2-256', format: 'dag-cbor' });
  // kubo-rpc-client returns { Key: <cid string> }
  const cidStr = putRes.Key || putRes.cid || putRes.Cid || putRes.path || putRes.Hash || putRes;
  const cid = CID.parse(typeof cidStr === 'string' ? cidStr : cidStr.toString());
  console.log('Block CID:', cid.toString());

  // 5. Pin the block
  await ipfs.pin.add(cid.toString());
  console.log('Pinned block:', cid.toString());

  // 6. Retrieve the block
  const retrievedBlock = await ipfs.block.get(cid.toString());
  const decoded = dagCbor.decode(retrievedBlock);
  console.log('Decoded block:', decoded);

  // 7. Test: Compare original and retrieved data
  if (Buffer.compare(data, decoded.data) === 0) {
    console.log('SUCCESS: Data matches!');
  } else {
    console.error('FAIL: Data does not match.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
