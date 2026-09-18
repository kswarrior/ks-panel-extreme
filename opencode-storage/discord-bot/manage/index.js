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

const PORT = process.env.MANAGE_PORT || 3000;

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
  });
  child.on("error", (e) => {
    appendLog(`[MANAGER] Bot spawn error: ${e.message}`);
  });

  appendLog(`[MANAGER] Bot started pid=${child.pid}`);
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
  // auto start bot?
  if (process.env.AUTO_START_BOT === "1") {
    console.log("[MANAGER] Auto-starting bot...");
    startBot();
  }
});

process.on("SIGTERM", () => {
  console.log("[MANAGER] SIGTERM");
  stopBot();
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  stopBot();
  server.close(() => process.exit(0));
});
