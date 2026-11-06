#!/usr/bin/env node
// Bakes the stills of the page with the same shader the page runs live: the poster behind the first screen (what
// shows before WebGL starts, or without it), the five stages of the dead world, the moon and the icon.
//
//   node tools/bake.mjs
//
// Needs Chrome installed. Writes to public/img and public/.
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!chrome) throw new Error("Chrome not found");

const JOBS = [
    { file: "img/poster.png", kind: "poster", w: 480, h: 300 },
    { file: "img/world-0.png", kind: "world", t: 0, w: 72, h: 72 },
    { file: "img/world-1.png", kind: "world", t: 0.25, w: 72, h: 72 },
    { file: "img/world-2.png", kind: "world", t: 0.5, w: 72, h: 72 },
    { file: "img/world-3.png", kind: "world", t: 0.75, w: 72, h: 72 },
    { file: "img/world-4.png", kind: "world", t: 1, w: 72, h: 72 },
    { file: "img/moon.png", kind: "moon", w: 160, h: 160 },
];

const bundle = await build({ entryPoints: [join(root, "src/scene/space.ts")], bundle: true, format: "iife", globalName: "Space", write: false, logLevel: "silent" });
const script = bundle.outputFiles[0].text;
const page = `<!doctype html><script>${script}</script><script>
(async () => {
  const jobs = ${JSON.stringify(JOBS)};
  const results = {};
  for (const job of jobs) {
    const c = document.createElement("canvas");
    c.width = job.w; c.height = job.h;
    Space.renderStill(c, job.kind, job.t ?? 0);
    results[job.file] = c.toDataURL("image/png");
  }
  await fetch("/done", { method: "POST", body: JSON.stringify(results) });
})().catch((e) => fetch("/done", { method: "POST", body: JSON.stringify({ error: String(e) }) }));
</script>`;

const profile = mkdtempSync(join(tmpdir(), "bake-"));
const finished = new Promise((done, fail) => {
    const server = createServer((req, res) => {
        if (req.method === "POST") {
            let body = "";
            req.on("data", (d) => (body += d));
            req.on("end", () => {
                res.end();
                server.close();
                done(JSON.parse(body));
            });
            return;
        }
        res.setHeader("content-type", "text/html");
        res.end(page);
    });
    server.listen(0, "127.0.0.1", () => {
        const child = spawn(chrome, ["--headless=new", "--disable-gpu-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/`], { stdio: "ignore" });
        setTimeout(() => fail(new Error("timed out")), 120000).unref();
        finished.finally(() => child.kill());
    });
});

const results = await finished;
if (results.error) throw new Error(results.error);
for (const [file, data] of Object.entries(results)) {
    writeFileSync(join(root, "public", file), Buffer.from(data.split(",")[1], "base64"));
    console.log("baked", file);
}
rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
process.exit(0);
