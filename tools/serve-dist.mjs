#!/usr/bin/env node
// Serves dist/ under /nebula-rosette/, the way GitHub Pages does: node tools/serve-dist.mjs [port]
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

const dist = resolve(import.meta.dirname, "../dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml" };
createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (!path.startsWith("/nebula-rosette")) { res.writeHead(404); return res.end("not found"); }
    let file = join(dist, path.slice("/nebula-rosette".length));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
}).listen(Number(process.argv[2] ?? 4173), "127.0.0.1");
