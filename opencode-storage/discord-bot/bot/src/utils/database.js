// Database manager – supports local SQLite (better-sqlite3) and Turso remote (libsql)
// Config via bot/db.json:
//   { "enabled": false, "url": "turso://...", "token": "eyJ..." }
//   enabled=false -> local SQLite files under DATA_ROOT/ksdcbot (better-sqlite3)
//   enabled=true  -> Turso remote via libsql (single shared DB). Falls back to local if libsql not installed or connection fails.
const path = require('path');
const fs = require('fs');

let DatabaseLocal = null;
try { DatabaseLocal = require('better-sqlite3'); } catch (e) { console.warn('[DB] better-sqlite3 not available:', e.message); }

let DatabaseTurso = null;
try {
  const libsql = require('libsql');
  DatabaseTurso = libsql.Database || libsql.default?.Database || libsql;
  // libsql package may export Database directly
  if (typeof DatabaseTurso !== 'function' && libsql.Database) DatabaseTurso = libsql.Database;
} catch {}
if (!DatabaseTurso) {
  try {
    const libsql2 = require('@libsql/client');
    // @libsql/client is async, not sync — we will handle via createClient wrapper if needed
    // For sync we prefer `libsql` package; if not found, we fallback to better-sqlite3
  } catch {}
}

// --- Load db.json ---
function loadDbConfig() {
  const cfgPaths = [
    path.resolve(__dirname, '../../db.json'), // bot/db.json
    path.resolve(__dirname, '../../../bot/db.json'),
  ];
  for (const p of cfgPaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        const j = JSON.parse(raw);
        // normalize: support {enabled, url, token} or {turso:{enabled,url,token}} or {useTurso, tursoUrl, tursoToken}
        let enabled = false;
        let url = '';
        let token = '';
        if (typeof j.enabled === 'boolean') enabled = j.enabled;
        else if (typeof j.useTurso === 'boolean') enabled = j.useTurso;
        else if (j.turso && typeof j.turso.enabled === 'boolean') enabled = j.turso.enabled;

        if (j.url) url = j.url;
        else if (j.tursoUrl) url = j.tursoUrl;
        else if (j.turso && j.turso.url) url = j.turso.url;

        if (j.token) token = j.token;
        else if (j.tursoToken) token = j.tursoToken;
        else if (j.turso && j.turso.token) token = j.turso.token;

        // also support flat token with space fix
        if (token) token = token.toString().trim().replace(/\s+/g, '');

        return { enabled, url: (url||'').trim(), token: (token||'').trim(), raw: j, path: p };
      }
    } catch (e) { console.warn('[DB] Failed to load db.json at', p, e.message); }
  }
  return { enabled: false, url: '', token: '', raw: null, path: null };
}

const dbConfig = loadDbConfig();
let useTurso = false;
let tursoUrl = '';
let tursoToken = '';
let tursoNormalizedUrl = '';

if (dbConfig.enabled && dbConfig.url && dbConfig.token) {
  let u = dbConfig.url;
  // normalize turso:// -> libsql:// for libsql client
  if (u.startsWith('turso://')) u = u.replace('turso://', 'libsql://');
  // libsql expects libsql:// or https://
  tursoUrl = u;
  tursoToken = dbConfig.token;
  tursoNormalizedUrl = tursoUrl;
  if (DatabaseTurso) {
    useTurso = true;
  } else {
    console.warn('[DB] db.json enabled=true but libsql not installed — falling back to local SQLite. Run: npm install libsql @libsql/client');
    useTurso = false;
  }
} else {
  if (dbConfig.enabled) {
    console.warn('[DB] db.json enabled=true but url/token missing — using local SQLite');
  }
  useTurso = false;
}

function resolveDataRoot() {
  const persistent = '/data';
  if (fs.existsSync(persistent)) {
    const dir = path.join(persistent, 'ksdcbot');
    try {
      fs.mkdirSync(dir, { recursive: true });
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
  if (useTurso) {
    console.log(`[DB] Using Turso remote: ${tursoNormalizedUrl} (local fallback dir: ${DB_DIR})`);
    console.log(`[DB] db.json: ${dbConfig.path} — enabled=true`);
  } else {
    console.log(`[DB] Using database directory: ${DB_DIR} (local SQLite)`);
    if (dbConfig.path) console.log(`[DB] db.json: ${dbConfig.path} — enabled=false (local)`);
    else console.log(`[DB] db.json not found — defaulting to local SQLite`);
  }
}

const connections = {};
let tursoShared = null;

function openLocal(name) {
  if (!DatabaseLocal) throw new Error('better-sqlite3 not available');
  const dbPath = path.join(DB_DIR, `${name}.db`);
  const db = new DatabaseLocal(dbPath);
  try { db.pragma('journal_mode = WAL'); } catch {}
  try { db.pragma('synchronous = NORMAL'); } catch {}
  try { db.pragma('foreign_keys = ON'); } catch {}
  try { db.pragma('cache_size = -20000'); } catch {}
  return db;
}

function openTurso() {
  if (tursoShared) return tursoShared;
  if (!DatabaseTurso) throw new Error('libsql Database not available');
  // libsql Database wants url like libsql://... and authToken
  const db = new DatabaseTurso(tursoNormalizedUrl, { authToken: tursoToken });
  // Turso pragma may not support WAL etc, but try
  try { db.pragma('foreign_keys = ON'); } catch {}
  // no journal_mode / synchronous for remote
  tursoShared = db;
  return db;
}

function open(name) {
  if (useTurso) {
    try {
      return openTurso();
    } catch (e) {
      console.error('[DB] Turso open failed, falling back to local for', name, e.message);
      useTurso = false;
      return openLocal(name);
    }
  }
  return openLocal(name);
}

function get(name) {
  if (useTurso) {
    // single shared Turso DB for all logical names (tables are namespaced by actual table names)
    if (!tursoShared) {
      try { tursoShared = openTurso(); } catch (e) {
        console.error('[DB] Turso get failed, fallback to local:', e.message);
        useTurso = false;
        // fallback
        if (!connections[name]) connections[name] = openLocal(name);
        return connections[name];
      }
    }
    return tursoShared;
  }
  if (!connections[name]) {
    connections[name] = openLocal(name);
  }
  return connections[name];
}

// Flush WAL so a checkpointed main DB file is on disk before exit/restart.
function flush(name) {
  if (useTurso) {
    // Turso remote flush not needed; but try checkpoint if shared
    if (tursoShared) { try { tursoShared.pragma('wal_checkpoint(TRUNCATE)'); } catch {} }
    return tursoShared;
  }
  const db = connections[name];
  if (db) { try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch {} }
  return db;
}
function flushAll() {
  if (useTurso) { if (tursoShared) try { tursoShared.pragma('wal_checkpoint(TRUNCATE)'); } catch {} return; }
  for (const n of Object.keys(connections)) flush(n);
}

function close(name) {
  if (useTurso) {
    if (tursoShared) { try { tursoShared.close(); } catch {} tursoShared = null; }
    return null;
  }
  const db = connections[name];
  if (db) { try { db.close(); } catch {} delete connections[name]; }
  return db;
}
function closeAll() {
  if (useTurso) { if (tursoShared) try { tursoShared.close(); } catch {} tursoShared = null; return; }
  for (const n of Object.keys(connections)) close(n);
}

// Best-effort durability hook on clean shutdowns.
for (const ev of ['exit', 'SIGINT', 'SIGTERM']) {
  process.on(ev, () => { flushAll(); });
}

module.exports = { get, flush, flushAll, close, closeAll, DB_DIR, useTurso: () => useTurso, getConfig: () => dbConfig };
