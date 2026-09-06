// Jot sync server — zero dependencies, Node >= 22 (node:sqlite).
// POST /sync  { cursor, notes:[{id, body, updatedAt, deleted}] }  ->  { cursor, notes:[...] }
// Auth: Authorization: Bearer $JOT_TOKEN
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT ?? 8787);
const TOKEN = process.env.JOT_TOKEN;
const DB_PATH = process.env.JOT_DB ?? 'jot.sqlite';
if (!TOKEN) { console.error('Set JOT_TOKEN'); process.exit(1); }

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notes_seq ON notes(seq);
`);
const qGet = db.prepare('SELECT updated_at FROM notes WHERE id = ?');
const qMaxSeq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM notes');
const qUpsert = db.prepare(`INSERT INTO notes (id, body, updated_at, deleted, seq) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at, deleted = excluded.deleted, seq = excluded.seq`);
const qSince = db.prepare('SELECT id, body, updated_at, deleted FROM notes WHERE seq > ? ORDER BY seq');

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function handleSync({ cursor = 0, notes = [] }) {
  let seq = qMaxSeq.get().s;
  const tx = db.exec.bind(db);
  tx('BEGIN');
  try {
    for (const n of notes) {
      if (!ID_RE.test(n.id) || typeof n.body !== 'string' || !Number.isFinite(n.updatedAt)) continue;
      const cur = qGet.get(n.id);
      if (cur && cur.updated_at >= n.updatedAt) continue; // last writer wins
      qUpsert.run(n.id, n.body, n.updatedAt, n.deleted ? 1 : 0, ++seq);
    }
    tx('COMMIT');
  } catch (e) { tx('ROLLBACK'); throw e; }
  const changed = qSince.all(Number(cursor) || 0).map((r) => ({
    id: r.id, body: r.body, updatedAt: r.updated_at, deleted: !!r.deleted,
  }));
  return { cursor: seq, notes: changed };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

createServer((req, res) => {
  if (req.method === 'OPTIONS') return res.writeHead(204, CORS).end();
  if (req.method === 'GET' && req.url === '/') return res.writeHead(200, CORS).end('jot sync ok');
  if (req.method !== 'POST' || req.url !== '/sync') return res.writeHead(404, CORS).end();
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401, CORS).end('unauthorized');
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 50e6) req.destroy(); });
  req.on('end', () => {
    try {
      const out = handleSync(JSON.parse(body));
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' }).end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(400, CORS).end(String(e.message ?? e));
    }
  });
}).listen(PORT, () => console.log(`jot sync on :${PORT} (db: ${DB_PATH})`));
