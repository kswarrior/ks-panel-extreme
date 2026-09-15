/*
 * TEST-ONLY runner — serves the static ../web folder over HTTP.
 * Not part of the website. Zero dependencies (Node built-ins only).
 *
 * Usage:
 *   node server.js            # serves ../web on 8080
 *   PORT=8090 node server.js  # custom port
 *   ROOT=/abs/path node server.js
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || process.argv[2] || "8080", 10);
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, "..", "web"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": type || "text/plain; charset=utf-8",
    "Content-Length": buf.length,
    "Cache-Control": "no-cache",
  });
  res.end(buf);
}

function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(path.join(ROOT, decoded));
  if (normalized !== ROOT && !normalized.startsWith(ROOT + path.sep)) return null;
  return normalized;
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed");
  }

  let file = resolveSafe(req.url || "/");
  if (!file) return send(res, 403, "Forbidden");

  try {
    let stat = null;
    try {
      stat = fs.statSync(file);
    } catch (e) {
      // extensionless -> try + ".html"  (so /features serves features.html)
      if (!path.extname(file)) {
        try {
          file = file + ".html";
          stat = fs.statSync(file);
        } catch (e2) {
          stat = null;
        }
      }
    }

    if (stat && stat.isDirectory()) {
      file = path.join(file, "index.html");
      stat = fs.statSync(file);
    }
    if (!stat || !stat.isFile()) return send(res, 404, "Not Found: " + req.url);

    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size });
      return res.end();
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
    console.log(new Date().toISOString(), req.method, req.url, "->", path.relative(ROOT, file));
  } catch (err) {
    console.error("ERR", req.url, err.message);
    send(res, 404, "Not Found: " + req.url);
  }
});

server.listen(PORT, () => {
  console.log("[web-runner] TEST server serving " + ROOT + " on http://localhost:" + PORT);
});
