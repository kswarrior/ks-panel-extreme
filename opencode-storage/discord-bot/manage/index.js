const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const cors = require("cors");
const multer = require("multer");

// Paths
const ROOT = path.resolve(__dirname, "..");
const BOT_DIR = path.resolve(ROOT, "bot");
const BOT_ENTRY = path.join(BOT_DIR, "index.js");
const LOG_FILE = path.join(BOT_DIR, "bot.log");
const DATA_DIR = path.join(BOT_DIR, "data");
const FRONTEND_DIST = path.join(__dirname, "frontend", "dist");

const PORT = process.env.MANAGE_PORT || 10000;

// Ensure BOT_DIR exists
if (!fs.existsSync(BOT_DIR)) {
  console.error(`BOT_DIR not found: ${BOT_DIR}`);
}

// --- Bot Process Manager ---
let botProcess = null;
let botStartTime = null;
let logBuffer = []; // keep last 5000 lines
const MAX_LOG_LINES = 5000;
let sseClients = [];

// --- Always-On ---
// All manager data saved in manage/data.json (per user request). Default: alwaysOn=true, reconnect 1s.
const MANAGER_STATE_FILE = path.join(__dirname, "data.json");
const LEGACY_MANAGER_STATE_FILE = path.join(DATA_DIR, "manager-state.json");
let alwaysOn = true; // default ON - always restart if stopped, in any way
let alwaysOnIntervalMs = 1000; // default 1s reconnect
let alwaysOnTimer = null;

function loadManagerState() {
  try {
    let raw = null;
    let source = null;
    if (fs.existsSync(MANAGER_STATE_FILE)) {
      raw = fs.readFileSync(MANAGER_STATE_FILE, "utf8");
      source = MANAGER_STATE_FILE;
    } else if (fs.existsSync(LEGACY_MANAGER_STATE_FILE)) {
      // migrate legacy
      raw = fs.readFileSync(LEGACY_MANAGER_STATE_FILE, "utf8");
      source = LEGACY_MANAGER_STATE_FILE;
      console.log(`[MANAGER] Migrating legacy state ${LEGACY_MANAGER_STATE_FILE} -> ${MANAGER_STATE_FILE}`);
    }
    if (raw) {
      const j = JSON.parse(raw);
      if (typeof j.alwaysOn === "boolean") alwaysOn = j.alwaysOn;
      if (typeof j.alwaysOnIntervalMs === "number" && j.alwaysOnIntervalMs >= 1000 && j.alwaysOnIntervalMs <= 3600000) {
        alwaysOnIntervalMs = j.alwaysOnIntervalMs;
      } else if (typeof j.alwaysOnIntervalSec === "number") {
        const ms = Math.round(j.alwaysOnIntervalSec * 1000);
        if (ms >= 1000 && ms <= 3600000) alwaysOnIntervalMs = ms;
      }
      // legacy interval in seconds
      if (typeof j.intervalSec === "number") {
        const ms = Math.round(j.intervalSec * 1000);
        if (ms >= 1000 && ms <= 3600000) alwaysOnIntervalMs = ms;
      }
      // if migrated, save to new location immediately
      if (source === LEGACY_MANAGER_STATE_FILE) saveManagerState();
    } else {
      // no file -> create with defaults (alwaysOn=true, 1s)
      saveManagerState();
    }
  } catch (e) { console.warn("[MANAGER] load state failed:", e.message); }
  // fix: if default is ON, ensure alwaysOn is true in any way when file missing/corrupt? Already default true.
  // But if user explicitly disabled, respect it. Only enforce default when file not exists.
}
function saveManagerState() {
  try {
    fs.mkdirSync(path.dirname(MANAGER_STATE_FILE), { recursive: true });
    // Save all default data + current state to manage/data.json
    const data = {
      alwaysOn,
      alwaysOnIntervalMs,
      intervalSec: Math.round(alwaysOnIntervalMs/1000),
      intervalMs: alwaysOnIntervalMs,
      // defaults for reference
      defaults: { alwaysOn: true, intervalSec: 1, intervalMs: 1000 },
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(MANAGER_STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.warn("[MANAGER] save state failed:", e.message); }
}
function clearAlwaysOnTimer() {
  if (alwaysOnTimer) { clearTimeout(alwaysOnTimer); alwaysOnTimer = null; }
}
function scheduleAlwaysOnRestart(reason) {
  if (!alwaysOn) return;
  clearAlwaysOnTimer();
  const sec = (alwaysOnIntervalMs/1000).toFixed(1);
  appendLog(`[ALWAYS-ON] Scheduling restart in ${sec}s (reason: ${reason})`);
  alwaysOnTimer = setTimeout(() => {
    alwaysOnTimer = null;
    const st = getBotStatus();
    if (st.status === "running") {
      appendLog(`[ALWAYS-ON] Bot already running, skip auto-restart`);
      return;
    }
    appendLog(`[ALWAYS-ON] Auto-restarting bot...`);
    const r = startBot();
    if (!r.ok) {
      appendLog(`[ALWAYS-ON] Start failed: ${r.message} — retry in ${sec}s`);
      scheduleAlwaysOnRestart("retry");
    }
  }, alwaysOnIntervalMs);
}
function setAlwaysOn(enabled, intervalMs) {
  alwaysOn = !!enabled;
  if (typeof intervalMs === "number" && intervalMs >= 1000 && intervalMs <= 3600000) {
    alwaysOnIntervalMs = Math.round(intervalMs);
  }
  saveManagerState();
  if (alwaysOn) {
    appendLog(`[ALWAYS-ON] Enabled (interval ${(alwaysOnIntervalMs/1000).toFixed(1)}s)`);
    // if bot is stopped, schedule start immediately
    const st = getBotStatus();
    if (st.status === "stopped") scheduleAlwaysOnRestart("enabled-while-stopped");
  } else {
    clearAlwaysOnTimer();
    appendLog(`[ALWAYS-ON] Disabled`);
  }
  return { ok: true, alwaysOn, intervalMs: alwaysOnIntervalMs, intervalSec: Math.round(alwaysOnIntervalMs/1000) };
}
loadManagerState();

function appendLog(line) {
  const ts = new Date().toISOString();
  // keep original line
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
  // append to file
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {}
  // push to SSE clients
  const data = JSON.stringify({ line });
  sseClients.forEach((res) => {
    try { res.write(`data: ${data}\n\n`); } catch {}
  });
}

function getBotStatus() {
  if (botProcess && !botProcess.killed && botProcess.pid) {
    // check if still alive
    try { process.kill(botProcess.pid, 0); } catch { // dead
      botProcess = null;
      return { status: "stopped", pid: null, uptime: 0, memory: null };
    }
    const uptime = botStartTime ? Math.floor((Date.now() - botStartTime) / 1000) : 0;
    return { status: "running", pid: botProcess.pid, uptime };
  }
  return { status: "stopped", pid: null, uptime: 0 };
}

function startBot() {
  const st = getBotStatus();
  if (st.status === "running") return { ok: false, message: "Bot already running", ...st };
  if (!fs.existsSync(BOT_ENTRY)) return { ok: false, message: `Entry not found: ${BOT_ENTRY}` };

  // truncate old log? keep
  try {
    if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "");
  } catch {}

  const child = spawn("node", ["index.js"], {
    cwd: BOT_DIR,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });
  botProcess = child;
  botStartTime = Date.now();

  child.stdout.on("data", (d) => {
    const lines = d.toString().split("\n");
    lines.forEach((l) => { if (l.trim() || l.includes("██")) appendLog(l); });
  });
  child.stderr.on("data", (d) => {
    const lines = d.toString().split("\n");
    lines.forEach((l) => { if (l.trim()) appendLog("[ERR] " + l); });
  });
  child.on("close", (code, signal) => {
    appendLog(`[MANAGER] Bot exited code=${code} signal=${signal}`);
    if (botProcess === child) {
      botProcess = null;
      botStartTime = null;
    }
    // Always-On: auto-restart if enabled (covers crash + manual stop)
    if (alwaysOn) {
      // don't restart if manager is shutting down? child close during manager exit will still schedule but manager exits soon
      scheduleAlwaysOnRestart(`exit code=${code} signal=${signal}`);
    }
  });
  child.on("error", (e) => {
    appendLog(`[MANAGER] Bot spawn error: ${e.message}`);
    if (alwaysOn) scheduleAlwaysOnRestart(`spawn error`);
  });

  appendLog(`[MANAGER] Bot started pid=${child.pid}`);
  clearAlwaysOnTimer(); // cancel pending restart since we are now running
  return { ok: true, message: "Bot started", status: "running", pid: child.pid };
}

function stopBot() {
  const st = getBotStatus();
  if (st.status !== "running" || !botProcess) return { ok: false, message: "Bot not running" };
  try {
    botProcess.kill("SIGTERM");
    // force kill after 5s
    const proc = botProcess;
    setTimeout(() => {
      try { if (proc && !proc.killed) proc.kill("SIGKILL"); } catch {}
    }, 5000);
    appendLog(`[MANAGER] Sent SIGTERM to pid=${proc.pid}`);
    return { ok: true, message: "Stopping bot" };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

function restartBot() {
  const st = getBotStatus();
  if (st.status === "running") {
    stopBot();
    // wait 2s then start
    return new Promise((resolve) => {
      setTimeout(() => {
        // wait until stopped
        const check = setInterval(() => {
          const s2 = getBotStatus();
          if (s2.status === "stopped") {
            clearInterval(check);
            resolve(startBot());
          }
        }, 300);
        // timeout 8s
        setTimeout(() => {
          clearInterval(check);
          const s2 = getBotStatus();
          if (s2.status === "stopped") resolve(startBot());
          else resolve({ ok: false, message: "Failed to stop" });
        }, 8000);
      }, 1000);
    });
  } else {
    return Promise.resolve(startBot());
  }
}

// Load initial logs
try {
  if (fs.existsSync(LOG_FILE)) {
    const content = fs.readFileSync(LOG_FILE, "utf8");
    const lines = content.split("\n").slice(-MAX_LOG_LINES);
    logBuffer = lines.filter(Boolean);
  }
} catch {}

// --- Express App ---
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Multer for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetPath = req.query.path || req.body.path || "";
    const safe = resolveSafePath(targetPath);
    if (!safe.ok) return cb(new Error(safe.message));
    const dir = fs.statSync(safe.fullPath).isDirectory() ? safe.fullPath : path.dirname(safe.fullPath);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Helper: safe path resolve
function resolveSafePath(inputPath) {
  const rel = (inputPath || "").replace(/^\/+/, "");
  const full = path.resolve(BOT_DIR, rel);
  // must be inside BOT_DIR
  if (!full.startsWith(BOT_DIR + path.sep) && full !== BOT_DIR) {
    return { ok: false, message: "Path traversal blocked" };
  }
  return { ok: true, fullPath: full, rel: path.relative(BOT_DIR, full) || "." };
}

function formatFileEntry(fullPath, rel) {
  const stat = fs.statSync(fullPath);
  return {
    name: path.basename(fullPath),
    path: rel,
    isDirectory: stat.isDirectory(),
    size: stat.size,
    mtime: stat.mtimeMs,
    mtimeIso: stat.mtime.toISOString(),
    ext: path.extname(fullPath),
  };
}

// --- API: Status ---
app.get("/api/status", (req, res) => {
  const st = getBotStatus();
  let mem = null;
  let cpu = null;
  if (st.pid) {
    try {
      const stat = fs.readFileSync(`/proc/${st.pid}/status`, "utf8");
      const rssMatch = stat.match(/VmRSS:\s+(\d+)\s+kB/);
      if (rssMatch) mem = parseInt(rssMatch[1], 10) * 1024;
    } catch {}
  }
  // list dbs counts
  let dbFiles = [];
  try { dbFiles = findDbFiles(); } catch {}
  res.json({
    ...st,
    startedAt: botStartTime,
    botDir: BOT_DIR,
    nodeVersion: process.version,
    managerUptime: process.uptime(),
    memory: mem,
    dbCount: dbFiles.length,
    logLines: logBuffer.length,
    alwaysOn,
    alwaysOnIntervalMs,
    alwaysOnIntervalSec: Math.round(alwaysOnIntervalMs/1000),
  });
});

app.post("/api/bot/start", (req, res) => {
  const r = startBot();
  res.json(r);
});
app.post("/api/bot/stop", (req, res) => {
  const r = stopBot();
  res.json(r);
});
app.post("/api/bot/restart", async (req, res) => {
  const r = await restartBot();
  res.json(r);
});

// --- Always-On API ---
app.get("/api/bot/always-on", (req, res) => {
  res.json({ ok: true, alwaysOn, intervalMs: alwaysOnIntervalMs, intervalSec: Math.round(alwaysOnIntervalMs/1000) });
});
app.post("/api/bot/always-on", (req, res) => {
  let { enabled, intervalSec, intervalMs, interval } = req.body || {};
  if (typeof enabled !== "boolean") {
    // allow toggle without explicit value -> toggle
    if (typeof req.body.enabled === "undefined") enabled = !alwaysOn;
  }
  let ms = alwaysOnIntervalMs;
  if (typeof intervalMs === "number") ms = intervalMs;
  else if (typeof intervalSec === "number") ms = Math.round(intervalSec * 1000);
  else if (typeof interval === "number") ms = interval * 1000 > 3600000 ? interval : Math.round(interval * 1000); // if >3600 treat as ms else sec
  else if (typeof interval === "string") { const v = parseFloat(interval); if (!isNaN(v)) ms = Math.round(v*1000); }

  if (ms < 1000) ms = 1000;
  if (ms > 3600000) ms = 3600000;
  const r = setAlwaysOn(enabled, ms);
  res.json({ ok: true, ...r, status: getBotStatus() });
});

// --- Logs ---
app.get("/api/logs", (req, res) => {
  const lines = parseInt(req.query.lines || "500", 10);
  const slice = logBuffer.slice(-lines);
  res.json({ lines: slice, total: logBuffer.length });
});
app.get("/api/logs/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });
  res.write(`data: ${JSON.stringify({ line: "[MANAGER] Connected to log stream" })}\n\n`);
  // send last 100
  logBuffer.slice(-100).forEach((l) => {
    res.write(`data: ${JSON.stringify({ line: l })}\n\n`);
  });
  sseClients.push(res);
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c !== res);
  });
});
app.post("/api/logs/clear", (req, res) => {
  logBuffer = [];
  try { fs.writeFileSync(LOG_FILE, ""); } catch {}
  res.json({ ok: true });
});
app.get("/api/logs/download", (req, res) => {
  res.download(LOG_FILE, "bot.log");
});

// --- Files ---
app.get("/api/files", (req, res) => {
  const p = req.query.path || "";
  const safe = resolveSafePath(p);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  const full = safe.fullPath;
  try {
    if (!fs.existsSync(full)) return res.status(404).json({ ok: false, message: "Not found" });
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      // if file, return file info
      return res.json({ ok: true, isFile: true, file: formatFileEntry(full, safe.rel), path: safe.rel });
    }
    // directory
    const entries = fs.readdirSync(full).map((name) => {
      const fp = path.join(full, name);
      try {
        const s = fs.statSync(fp);
        return {
          name,
          path: path.join(safe.rel, name).replace(/\\/g, "/"),
          isDirectory: s.isDirectory(),
          size: s.size,
          mtime: s.mtimeMs,
          mtimeIso: s.mtime.toISOString(),
          ext: path.extname(name),
        };
      } catch (e) {
        return { name, path: path.join(safe.rel, name), isDirectory: false, size: 0, error: e.message };
      }
    });
    // sort dirs first
    entries.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ ok: true, isFile: false, path: safe.rel, entries, parent: path.dirname(safe.rel) });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get("/api/files/read", (req, res) => {
  const p = req.query.path || "";
  const safe = resolveSafePath(p);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  const full = safe.fullPath;
  try {
    if (!fs.existsSync(full)) return res.status(404).json({ ok: false, message: "Not found" });
    const stat = fs.statSync(full);
    if (stat.isDirectory()) return res.status(400).json({ ok: false, message: "Is directory" });
    if (stat.size > 5 * 1024 * 1024) return res.status(400).json({ ok: false, message: "File too large (>5MB) to edit" });
    const content = fs.readFileSync(full, "utf8");
    res.json({ ok: true, content, path: safe.rel, size: stat.size, mtime: stat.mtimeMs });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.post("/api/files/write", (req, res) => {
  const { path: p, content } = req.body;
  if (typeof p !== "string") return res.status(400).json({ ok: false, message: "path required" });
  const safe = resolveSafePath(p);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  const full = safe.fullPath;
  try {
    // ensure dir exists
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content || "", "utf8");
    res.json({ ok: true, message: "Saved" });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.post("/api/files/mkdir", (req, res) => {
  const { path: p } = req.body;
  const safe = resolveSafePath(p);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  try {
    fs.mkdirSync(safe.fullPath, { recursive: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.post("/api/files/create", (req, res) => {
  const { path: p, isDir } = req.body;
  const safe = resolveSafePath(p);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  try {
    if (isDir) fs.mkdirSync(safe.fullPath, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(safe.fullPath), { recursive: true });
      if (fs.existsSync(safe.fullPath)) return res.status(400).json({ ok: false, message: "Already exists" });
      fs.writeFileSync(safe.fullPath, "", "utf8");
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.post("/api/files/delete", (req, res) => {
  const { path: p } = req.body;
  const safe = resolveSafePath(p);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  if (safe.rel === "." || safe.rel === "") return res.status(400).json({ ok: false, message: "Cannot delete root" });
  const full = safe.fullPath;
  try {
    if (!fs.existsSync(full)) return res.status(404).json({ ok: false, message: "Not found" });
    const stat = fs.statSync(full);
    if (stat.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
    else fs.unlinkSync(full);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.post("/api/files/rename", (req, res) => {
  const { from, to } = req.body;
  const sf = resolveSafePath(from);
  const st = resolveSafePath(to);
  if (!sf.ok) return res.status(400).json({ ok: false, message: sf.message });
  if (!st.ok) return res.status(400).json({ ok: false, message: st.message });
  if (sf.rel === "." || sf.rel === "") return res.status(400).json({ ok: false, message: "Cannot rename root" });
  try {
    if (!fs.existsSync(sf.fullPath)) return res.status(404).json({ ok: false, message: "Source not found" });
    if (fs.existsSync(st.fullPath)) return res.status(400).json({ ok: false, message: "Destination exists" });
    fs.mkdirSync(path.dirname(st.fullPath), { recursive: true });
    fs.renameSync(sf.fullPath, st.fullPath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get("/api/files/download", (req, res) => {
  const p = req.query.path || "";
  const safe = resolveSafePath(p);
  if (!safe.ok) return res.status(400).send(safe.message);
  const full = safe.fullPath;
  try {
    if (!fs.existsSync(full)) return res.status(404).send("Not found");
    const stat = fs.statSync(full);
    if (stat.isDirectory()) return res.status(400).send("Is directory");
    res.download(full, path.basename(full));
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.post("/api/files/upload", upload.array("files", 20), (req, res) => {
  // multer already saved
  res.json({ ok: true, uploaded: (req.files || []).map((f) => f.originalname) });
});
app.post("/api/files/upload-one", upload.single("file"), (req, res) => {
  res.json({ ok: true, file: req.file?.originalname });
});

// --- Database ---
function findDbFiles() {
  const dbs = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // skip node_modules
        if (e.name === "node_modules") continue;
        walk(full);
      } else if (e.isFile() && (e.name.endsWith(".db") || e.name.endsWith(".sqlite") || e.name.endsWith(".sqlite3"))) {
        const rel = path.relative(BOT_DIR, full).replace(/\\/g, "/");
        const stat = fs.statSync(full);
        dbs.push({ name: e.name, path: rel, full, size: stat.size, mtime: stat.mtimeMs });
      }
    }
  }
  if (fs.existsSync(DATA_DIR)) walk(DATA_DIR);
  // also check BOT_DIR directly but not recursively too deep
  try { walk(BOT_DIR); } catch {}
  // dedup
  const seen = new Set();
  const uniq = [];
  for (const d of dbs) { if (!seen.has(d.full)) { seen.add(d.full); uniq.push(d); } }
  return uniq;
}

app.get("/api/db/list", (req, res) => {
  try {
    const dbs = findDbFiles();
    res.json({ ok: true, dbs });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get("/api/db/tables", (req, res) => {
  const dbPath = req.query.db;
  if (!dbPath) return res.status(400).json({ ok: false, message: "db required" });
  const safe = resolveSafePath(dbPath);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  const full = safe.fullPath;
  if (!fs.existsSync(full)) return res.status(404).json({ ok: false, message: "DB not found" });
  let db;
  try {
    const Database = require("better-sqlite3");
    db = new Database(full, { readonly: true });
    const tables = db.prepare(`SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
    // enrich with counts
    const enriched = tables.map((t) => {
      try {
        const cnt = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get();
        return { ...t, count: cnt.c };
      } catch {
        return { ...t, count: null };
      }
    });
    res.json({ ok: true, tables: enriched });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    try { db && db.close(); } catch {}
  }
});

app.get("/api/db/schema", (req, res) => {
  const dbPath = req.query.db;
  const table = req.query.table;
  if (!dbPath || !table) return res.status(400).json({ ok: false, message: "db and table required" });
  const safe = resolveSafePath(dbPath);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  const full = safe.fullPath;
  let db;
  try {
    const Database = require("better-sqlite3");
    db = new Database(full, { readonly: true });
    const info = db.prepare(`PRAGMA table_info("${table}")`).all();
    const sql = db.prepare(`SELECT sql FROM sqlite_master WHERE name=?`).get(table);
    res.json({ ok: true, columns: info, createSql: sql?.sql || null });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  } finally { try { db && db.close(); } catch {} }
});

app.get("/api/db/rows", (req, res) => {
  const dbPath = req.query.db;
  const table = req.query.table;
  const page = parseInt(req.query.page || "1", 10);
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const search = (req.query.search || "").trim();
  if (!dbPath || !table) return res.status(400).json({ ok: false, message: "db and table required" });
  const safe = resolveSafePath(dbPath);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  const full = safe.fullPath;
  let db;
  try {
    const Database = require("better-sqlite3");
    db = new Database(full, { readonly: true });
    // validate table exists
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE name=?`).get(table);
    if (!exists) return res.status(404).json({ ok: false, message: "Table not found" });
    const offset = (page - 1) * limit;
    let rows, total;
    if (search) {
      // get columns for search
      const cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
      const where = cols.map((c) => `"${c}" LIKE ?`).join(" OR ");
      const like = `%${search}%`;
      const params = cols.map(() => like);
      total = db.prepare(`SELECT COUNT(*) as c FROM "${table}" WHERE ${where}`).get(...params).c;
      rows = db.prepare(`SELECT * FROM "${table}" WHERE ${where} LIMIT ? OFFSET ?`).all(...params, limit, offset);
    } else {
      total = db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get().c;
      rows = db.prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`).all(limit, offset);
    }
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all();
    res.json({ ok: true, rows, total, page, limit, totalPages: Math.ceil(total / limit), columns });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  } finally { try { db && db.close(); } catch {} }
});

app.post("/api/db/query", (req, res) => {
  const { db: dbPath, sql } = req.body;
  if (!dbPath || !sql) return res.status(400).json({ ok: false, message: "db and sql required" });
  const safe = resolveSafePath(dbPath);
  if (!safe.ok) return res.status(400).json({ ok: false, message: safe.message });
  const full = safe.fullPath;
  // block dangerous
  const lower = sql.trim().toLowerCase();
  // allow SELECT and limited others but in readonly? we open readonly false for writes if explicitly allowed? Keep readonly for safety unless user wants writes - allow but warn
  let db;
  try {
    const Database = require("better-sqlite3");
    // if mutating, open writable
    const isSelect = lower.startsWith("select") || lower.startsWith("pragma") || lower.startsWith("explain");
    db = new Database(full, { readonly: isSelect });
    if (isSelect) {
      const rows = db.prepare(sql).all();
      res.json({ ok: true, rows, isSelect: true });
    } else {
      const info = db.prepare(sql).run();
      res.json({ ok: true, info, isSelect: false });
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  } finally { try { db && db.close(); } catch {} }
});

// --- Git Update ---
const GIT_DEFAULT_URL = "https://github.com/kswarrior/ks-panel-extreme/";
const GIT_DEFAULT_SUBPATH = "opencode-storage/discord-bot";

app.get("/api/git/info", (req, res) => {
  res.json({
    ok: true,
    defaultUrl: GIT_DEFAULT_URL,
    defaultSubPath: GIT_DEFAULT_SUBPATH,
    botDir: BOT_DIR,
    rootPath: ROOT,
    fileRoot: "./",
    fileRootDesc: "bot folder (./)",
  });
});

app.post("/api/git/update", async (req, res) => {
  const gitUrl = (req.body.url || GIT_DEFAULT_URL).trim();
  const branch = (req.body.branch || "").trim();
  const subPath = (req.body.subPath || GIT_DEFAULT_SUBPATH).trim();
  const fileRoot = (req.body.fileRoot || "./").trim(); // ./ means BOT_DIR
  const deleteAll = req.body.deleteAll !== false; // default true

  // Validate URL
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?(\.git)?$/.test(gitUrl) && !/^https:\/\/.+/.test(gitUrl)) {
    return res.status(400).json({ ok: false, message: "Invalid git URL. Must be https://..." });
  }
  // Only allow github for safety, but allow custom if user asks
  // Stop bot first
  const wasRunning = getBotStatus().status === "running";
  if (wasRunning) {
    appendLog("[GIT] Stopping bot before update...");
    stopBot();
    await new Promise(r => setTimeout(r, 2000));
  }

  const tmpRoot = fs.mkdtempSync(path.join(require("os").tmpdir(), "git-update-"));
  const cloneDir = path.join(tmpRoot, "repo");
  let logs = [];
  function glog(m){ logs.push(m); appendLog(`[GIT] ${m}`); console.log(`[GIT] ${m}`); }

  try {
    glog(`Cloning ${gitUrl} ${branch ? `(branch ${branch})` : "(default branch)"} ...`);
    // Build clone command
    const cloneArgs = ["clone", "--depth", "1"];
    if (branch) cloneArgs.push("--branch", branch);
    cloneArgs.push(gitUrl, cloneDir);
    const cloneRes = await runCmd("git", cloneArgs, { timeout: 120000 });
    if (cloneRes.code !== 0) {
      throw new Error(`git clone failed: ${cloneRes.stderr || cloneRes.stdout}`);
    }
    glog(`Cloned to ${cloneDir}`);

    // Resolve source path
    let source = path.join(cloneDir, subPath);
    // If fileRoot is "./" (bot folder), and source is .../discord-bot which contains bot/, use bot/ subdir
    if (fileRoot === "./" || fileRoot === "." || fileRoot === "bot") {
      const botSub = path.join(source, "bot");
      if (fs.existsSync(botSub) && fs.statSync(botSub).isDirectory()) {
        // Check if botSub looks like bot (has package.json or index.js)
        if (fs.existsSync(path.join(botSub, "package.json")) || fs.existsSync(path.join(botSub, "index.js"))) {
          glog(`Using bot subfolder: ${path.relative(cloneDir, botSub)} -> ./ (BOT_DIR)`);
          source = botSub;
        }
      }
    }
    if (!fs.existsSync(source)) {
      throw new Error(`Source path not found in repo: ${subPath} (tried ${path.relative(cloneDir, source)})`);
    }
    glog(`Source: ${path.relative(cloneDir, source)} -> Target: ${BOT_DIR} (fileRoot ${fileRoot})`);

    // Backup .env and data if exists and deleteAll
    let backupEnv = null, backupData = null;
    const backupDir = path.join(tmpRoot, "backup");
    if (deleteAll) {
      fs.mkdirSync(backupDir, { recursive: true });
      const envPath = path.join(BOT_DIR, ".env");
      const dataPath = path.join(BOT_DIR, "data");
      if (fs.existsSync(envPath)) {
        backupEnv = fs.readFileSync(envPath);
        glog(`Backed up .env (${backupEnv.length} bytes)`);
      }
      if (fs.existsSync(dataPath)) {
        // copy data dir to backup
        fs.cpSync(dataPath, path.join(backupDir, "data"), { recursive: true });
        glog(`Backed up data/`);
      }
      // Delete all in BOT_DIR
      glog(`Deleting all in ${BOT_DIR} ...`);
      const entries = fs.readdirSync(BOT_DIR);
      for (const e of entries) {
        const p = path.join(BOT_DIR, e);
        try { fs.rmSync(p, { recursive: true, force: true }); glog(`  deleted ${e}`); } catch (err) { glog(`  failed delete ${e}: ${err.message}`); }
      }
    }

    // Copy source to BOT_DIR
    glog(`Copying ${path.relative(cloneDir, source)} -> ${BOT_DIR} ...`);
    // Use cpSync recursive
    fs.cpSync(source, BOT_DIR, { recursive: true, filter: (src) => {
      // skip .git, node_modules, data backup
      const rel = path.relative(source, src);
      if (rel.startsWith(".git")) return false;
      if (rel.split(path.sep).includes("node_modules")) return false;
      return true;
    }});
    glog(`Copied files`);

    // Restore .env and data if backed up
    if (backupEnv) {
      fs.writeFileSync(path.join(BOT_DIR, ".env"), backupEnv);
      glog(`Restored .env`);
    }
    if (fs.existsSync(path.join(backupDir, "data"))) {
      const targetData = path.join(BOT_DIR, "data");
      // merge or overwrite? keep existing data, but ensure restored
      if (!fs.existsSync(targetData)) fs.mkdirSync(targetData, { recursive: true });
      // if target data was overwritten by git, merge backup back (backup wins for existing dbs)
      // For now, ensure backup data files exist
      fs.cpSync(path.join(backupDir, "data"), targetData, { recursive: true, force: true });
      glog(`Restored data/`);
    }

    // Ensure data dir exists
    fs.mkdirSync(path.join(BOT_DIR, "data"), { recursive: true });

    // Run npm install if package.json exists
    if (fs.existsSync(path.join(BOT_DIR, "package.json"))) {
      glog(`Running npm install in ${BOT_DIR} ...`);
      const npmRes = await runCmd("npm", ["install", "--omit=dev"], { cwd: BOT_DIR, timeout: 300000 });
      glog(`npm install exit ${npmRes.code}`);
      if (npmRes.stdout) glog(npmRes.stdout.slice(0, 2000));
      if (npmRes.stderr) glog(npmRes.stderr.slice(0, 2000));
      if (npmRes.code !== 0) {
        glog(`WARN: npm install failed, bot may need manual install`);
      } else {
        glog(`npm install completed`);
      }
    }

    // Cleanup
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}

    glog(`Git update completed. Restart bot from Home → Start.`);
    res.json({ ok: true, message: "Git update completed", logs, wasRunning, fileRoot, source: path.relative(cloneDir, source) });
  } catch (e) {
    const msg = e.message || String(e);
    glog(`FAILED: ${msg}`);
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
    res.status(500).json({ ok: false, message: msg, logs });
  }
});

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const spawnOpts = { stdio: "pipe", ...opts };
    const p = spawn(cmd, args, spawnOpts);
    let stdout = "", stderr = "";
    if (p.stdout) p.stdout.on("data", d => stdout += d.toString());
    if (p.stderr) p.stderr.on("data", d => stderr += d.toString());
    let timedOut = false;
    let timer = null;
    if (opts.timeout) {
      timer = setTimeout(() => {
        timedOut = true;
        try { p.kill("SIGKILL"); } catch {}
        resolve({ code: 124, stdout, stderr: stderr + "\nTimeout" });
      }, opts.timeout);
    }
    p.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (!timedOut) resolve({ code: code ?? 1, stdout, stderr });
    });
    p.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: String(err) });
    });
  });
}

// Serve frontend
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ ok: false, message: "API not found" });
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send(`<html><body style="background:#0f172a;color:#e2e8f0;font-family:system-ui;padding:40px"><h1 style="color:#3b82f6">KS Bot Manager</h1><p>Frontend not built yet. Run <code>cd manage/frontend && npm install && npm run build</code></p><p>API is running at /api/status</p></body></html>`);
  });
}

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[MANAGER] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[MANAGER] Bot dir: ${BOT_DIR}`);
  console.log(`[MANAGER] Frontend: ${fs.existsSync(FRONTEND_DIST) ? FRONTEND_DIST : "not built"}`);
  console.log(`[MANAGER] Always-On: ${alwaysOn ? `ON (${(alwaysOnIntervalMs/1000).toFixed(1)}s interval)` : "OFF"}`);
  // auto start bot?
  if (process.env.AUTO_START_BOT === "1") {
    console.log("[MANAGER] Auto-starting bot...");
    startBot();
  } else if (alwaysOn) {
    const st = getBotStatus();
    if (st.status === "stopped") {
      console.log(`[ALWAYS-ON] Bot stopped while manager was offline — scheduling restart in ${(alwaysOnIntervalMs/1000).toFixed(1)}s`);
      scheduleAlwaysOnRestart("manager-start");
    }
  }
});

process.on("SIGTERM", () => {
  console.log("[MANAGER] SIGTERM");
  clearAlwaysOnTimer();
  stopBot();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  clearAlwaysOnTimer();
  stopBot();
  server.close(() => process.exit(0));
});
