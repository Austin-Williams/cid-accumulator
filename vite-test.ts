import { IndexedDBAdapter } from "./source/adapters/storage/IndexedDBAdapter";

(window as any).runTest = async function() {
  const out = document.getElementById('output');
  const db = new IndexedDBAdapter();
  await db.put('foo', 'bar');
  let val = await db.get('foo');
  out!.textContent = 'Value for foo: ' + val + '\n';
  await db.delete('foo');
  val = await db.get('foo');
  out!.textContent += 'Value after delete: ' + val;
};
