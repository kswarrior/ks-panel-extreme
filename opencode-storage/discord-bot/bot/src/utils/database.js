// Database manager – one connection per logical DB file
// All DB files live under <DATA_ROOT>/ksdcbot
// On Hugging Face Spaces the persistent (read+write) volume is mounted at /data,
// so we prefer /data/ksdcbot there. Locally we fall back to ./data/ksdcbot so the
// repo still works during development. This keeps writes out of the image layer
// so data survives container restarts / image rebuilds.
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function resolveDataRoot() {
  const persistent = '/data';
  if (fs.existsSync(persistent)) {
    const dir = path.join(persistent, 'ksdcbot');
    try {
      fs.mkdirSync(dir, { recursive: true });
      // Confirm we can actually write into it (HF Spaces storagePermission).
      const probe = path.join(dir, '.wprobe');
      fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe);
      return dir;
    } catch { /* not writable → fall through */ }
  }
  const local = path.resolve(__dirname, '../../data/ksdcbot');
  fs.mkdirSync(local, { recursive: true });
  return local;
}

const DB_DIR = resolveDataRoot();
if (process.env.NODE_ENV !== 'test') {
  console.log(`[DB] Using database directory: ${DB_DIR}`);
}

const connections = {};

function open(name) {
  const dbPath = path.join(DB_DIR, `${name}.db`);
  const db = new Database(dbPath);
  // Durability first: a write is flushed to the file before the call returns, so
  // nothing sits only in RAM. WAL gives us fsync safety with NORMAL here.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -20000'); // ~20 MiB cache
  return db;
}

function get(name) {
  if (!connections[name]) {
    connections[name] = open(name);
  }
  return connections[name];
}

// Flush WAL so a checkpointed main DB file is on disk before exit/restart.
function flush(name) {
  const db = connections[name];
  if (db) { try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {} }
  return db;
}
function flushAll() { for (const n of Object.keys(connections)) flush(n); }

function close(name) {
  const db = connections[name];
  if (db) { try { db.close(); } catch {} delete connections[name]; }
  return db;
}
function closeAll() { for (const n of Object.keys(connections)) close(n); }

// Best-effort durability hook on clean shutdowns.
for (const ev of ['exit', 'SIGINT', 'SIGTERM']) {
  process.on(ev, () => { flushAll(); });
}

module.exports = { get, flush, flushAll, close, closeAll, DB_DIR };

