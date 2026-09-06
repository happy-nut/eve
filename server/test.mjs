// Self-check: push, pull, LWW conflict, tombstone. Run: node server/test.mjs
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const PORT = 18787, TOKEN = 't', DB = 'test.sqlite';
rmSync(DB, { force: true });
const srv = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, PORT, JOT_TOKEN: TOKEN, JOT_DB: DB } });
await new Promise((r) => srv.stdout.once('data', r));
const sync = (cursor, notes) =>
  fetch(`http://localhost:${PORT}/sync`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ cursor, notes }) }).then((r) => r.json());
try {
  // client A pushes
  let a = await sync(0, [{ id: 'n1', body: 'hello', updatedAt: 100, deleted: false }]);
  assert.equal(a.notes.length, 1);
  // client B pulls from 0
  let b = await sync(0, []);
  assert.equal(b.notes[0].body, 'hello');
  // B edits later, A edits earlier -> B wins
  await sync(b.cursor, [{ id: 'n1', body: 'from B', updatedAt: 300, deleted: false }]);
  a = await sync(a.cursor, [{ id: 'n1', body: 'from A (stale)', updatedAt: 200, deleted: false }]);
  assert.equal(a.notes.at(-1).body, 'from B');
  // tombstone propagates
  await sync(a.cursor, [{ id: 'n1', body: '', updatedAt: 400, deleted: true }]);
  b = await sync(b.cursor, []);
  assert.equal(b.notes.at(-1).deleted, true);
  // auth
  const r = await fetch(`http://localhost:${PORT}/sync`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 401);
  console.log('SYNC_OK');
} finally {
  srv.kill();
  rmSync(DB, { force: true });
}
