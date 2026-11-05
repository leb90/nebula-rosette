#!/usr/bin/env node
// Walks the built page in Chrome at phone, tablet and desktop sizes and reports what the eye would catch:
//
// - text inside a sticky element that, while it holds, sits under the top bar (or under its dithered edge);
// - a sticky element that runs past the bottom of the screen while it holds, and clips what's there;
// - an anchor (#historia, #apoyar...) that lands with its section under the top bar;
// - text that runs past the edge of the screen.
//
// If the top bar ever hides itself on scroll, the check keeps it shown: the worst case.
//
//   npm run build && node tools/check-layout.mjs [--url http://127.0.0.1:4173/] [--shots dir]
//
// Without --url it serves dist/ itself. With --shots it saves a picture of every problem. Needs Chrome installed.
// Exits with 1 when something is wrong.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(existsSync);
if (!chrome) throw new Error("Chrome not found");

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const shots = option("--shots");

const VIEWPORTS = [
    { name: "phone-small", width: 360, height: 640, mobile: true },
    { name: "phone", width: 390, height: 844, mobile: true },
    { name: "tablet", width: 768, height: 1024, mobile: true },
    { name: "laptop", width: 1280, height: 800, mobile: false },
    { name: "desktop", width: 1680, height: 1050, mobile: false },
];

// What runs inside the page. It returns the problems, each with the scroll where it shows.
const inspect = async ({ barSelector, pinCss }) => {
    const pin = document.createElement("style");
    pin.id = "layout-pin";
    pin.textContent = pinCss;
    document.head.append(pin);
    const problems = [];
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const settle = async () => {
        await frame();
        await new Promise((done) => setTimeout(done, 30));
    };
    const describe = (el) => {
        const id = el.id ? `#${el.id}` : "";
        const classes = [...el.classList].map((c) => `.${c}`).join("");
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
        return `${el.tagName.toLowerCase()}${id}${classes}${text ? ` "${text}"` : ""}`;
    };
    const hidden = (el) => el.closest("[aria-hidden=true]") || el.getBoundingClientRect().width <= 1 || getComputedStyle(el).visibility === "hidden";
    const add = (problem) => {
        if (!problems.some((p) => p.kind === problem.kind && p.element === problem.element)) problems.push({ ...problem, y: Math.round(scrollY) });
    };

    document.documentElement.style.scrollBehavior = "auto";
    const bar = document.querySelector(barSelector);
    if (!bar) return [{ kind: "setup", element: barSelector, detail: "the top bar is not on the page" }];
    const vw = innerWidth;
    const vh = innerHeight;
    const everything = [...document.querySelectorAll("body *")];
    const sticky = everything.filter((el) => el !== bar && getComputedStyle(el).position === "sticky");
    const texts = everything.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));

    // The whole length, a third of a screen at a time.
    const length = document.documentElement.scrollHeight;
    for (let y = 0; y <= length; y += Math.round(vh / 3)) {
        scrollTo(0, y);
        await settle();
        const barBox = bar.getBoundingClientRect();
        const barShows = barBox.top <= 0.5 && barBox.bottom > 0;
        const edge = getComputedStyle(bar, "::after");
        const covered = barBox.bottom + (edge.content !== "none" && edge.position === "absolute" ? parseFloat(edge.height) || 0 : 0);

        for (const el of sticky) {
            if (hidden(el)) continue;
            const box = el.getBoundingClientRect();
            const top = parseFloat(getComputedStyle(el).top);
            if (Number.isNaN(top) || Math.abs(box.top - top) > 1 || box.bottom <= 0) continue;
            const under = barShows && texts.find((t) => el.contains(t) && !hidden(t) && t.getBoundingClientRect().top < covered - 0.5 && t.getBoundingClientRect().bottom > 0);
            if (under)
                add({
                    kind: "under-bar",
                    element: describe(under),
                    detail: `held by ${describe(el)} at ${Math.round(under.getBoundingClientRect().top)}px, the top bar covers down to ${Math.round(covered)}px`,
                });
            if (box.bottom > vh + 1 && getComputedStyle(el).overflow !== "visible")
                add({ kind: "past-bottom", element: describe(el), detail: `holds ${Math.round(box.bottom - vh)}px below the screen, and it clips them` });
        }

        for (const el of texts) {
            const box = el.getBoundingClientRect();
            if (box.bottom < 0 || box.top > vh || hidden(el)) continue;
            if (box.right > vw + 1 || box.left < -1) add({ kind: "off-screen", element: describe(el), detail: `spans ${Math.round(box.left)}px to ${Math.round(box.right)}px on a ${vw}px screen` });
        }
    }

    // Every anchor the page links to, the way a click on it lands.
    const targets = new Set([...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href")).filter((h) => h.length > 1));
    for (const hash of targets) {
        const target = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (!target) {
            add({ kind: "anchor", element: hash, detail: "links to nothing" });
            continue;
        }
        scrollTo(0, 0);
        await settle();
        target.scrollIntoView({ block: "start" });
        await settle();
        const barBox = bar.getBoundingClientRect();
        const box = target.getBoundingClientRect();
        const atEnd = scrollY < 1 || scrollY + vh >= document.documentElement.scrollHeight - 1;
        if (barBox.top <= 0.5 && box.top < barBox.bottom - 0.5 && !atEnd && target !== bar && !target.contains(bar))
            add({ kind: "anchor", element: hash, detail: `lands at ${Math.round(box.top)}px, under the top bar (${Math.round(barBox.bottom)}px)` });
    }
    scrollTo(0, 0);
    return problems;
};

// Until the new page has loaded, its fonts are in and the scripts have had a moment to place things.
async function loaded() {
    for (let tries = 0; tries < 100; tries++) {
        const { result } = await cdp.send("Runtime.evaluate", { expression: "!window.layoutStale && document.readyState === 'complete'", returnByValue: true });
        if (result.value) break;
        await new Promise((done) => setTimeout(done, 100));
    }
    await cdp.send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => new Promise((done) => setTimeout(done, 300)))", awaitPromise: true });
}

// A small client for the Chrome DevTools protocol, enough for one page.
async function connect(url) {
    const socket = new WebSocket(url);
    await new Promise((done, fail) => {
        socket.onopen = done;
        socket.onerror = fail;
    });
    let next = 0;
    const waiting = new Map();
    socket.onmessage = (message) => {
        const data = JSON.parse(message.data);
        const pending = waiting.get(data.id);
        if (!pending) return;
        waiting.delete(data.id);
        data.error ? pending.fail(new Error(data.error.message)) : pending.done(data.result);
    };
    return {
        send: (method, params = {}) =>
            new Promise((done, fail) => {
                const id = ++next;
                waiting.set(id, { done, fail });
                socket.send(JSON.stringify({ id, method, params }));
            }),
        close: () => socket.close(),
    };
}

function serveDist() {
    const dist = join(root, "dist");
    if (!existsSync(join(dist, "index.html"))) throw new Error("dist/ is empty: run npm run build first");
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2" };
    const server = createServer((req, res) => {
        let file = join(dist, decodeURIComponent(new URL(req.url, "http://x").pathname));
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
        if (!existsSync(file)) {
            res.writeHead(404);
            return res.end();
        }
        res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
        createReadStream(file).pipe(res);
    });
    return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

const BAR = ".topbar";
// The bar shown, whatever moves it, and everything in it.
const PIN_CSS = `${BAR}, ${BAR} * { transform: none !important; translate: none !important; opacity: 1 !important; transition: none !important; }`;

const server = option("--url") ? null : await serveDist();
const url = option("--url") ?? `http://127.0.0.1:${server.address().port}/`;
const profile = mkdtempSync(join(tmpdir(), "layout-"));
let cdp = null;
let failed = 0;
const child = spawn(
    chrome,
    [
        "--headless=new",
        "--remote-debugging-port=0",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
        "--hide-scrollbars",
        `--user-data-dir=${profile}`,
        "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
);
try {
    const browserUrl = await new Promise((done, fail) => {
        let log = "";
        child.stderr.on("data", (d) => {
            log += d;
            const found = log.match(/DevTools listening on (ws:\/\/\S+)/);
            if (found) done(found[1]);
        });
        setTimeout(() => fail(new Error("Chrome did not start")), 20000).unref();
    });
    const { port } = new URL(browserUrl);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    cdp = await connect(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    if (shots) mkdirSync(shots, { recursive: true });

    for (const view of VIEWPORTS) {
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: view.mobile });
        await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: view.mobile });
        await cdp.send("Runtime.evaluate", { expression: "window.layoutStale = true" });
        await cdp.send("Page.navigate", { url });
        await loaded();
        const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
            expression: `(${inspect})(${JSON.stringify({ barSelector: BAR, pinCss: PIN_CSS })})`,
            awaitPromise: true,
            returnByValue: true,
        });
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        const problems = result.value;
        console.log(`\n${view.name} ${view.width}x${view.height}: ${problems.length ? `${problems.length} problem(s)` : "ok"}`);
        for (const [i, p] of problems.entries()) {
            console.log(`  [${p.kind}] ${p.element}\n      ${p.detail}${p.kind === "anchor" ? "" : ` (scroll ${p.y})`}`);
            if (shots && p.kind !== "anchor") {
                await cdp.send("Runtime.evaluate", { expression: `scrollTo(0, ${p.y})`, awaitPromise: true });
                await new Promise((done) => setTimeout(done, 300));
                const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
                writeFileSync(join(shots, `${view.name}-${i}-${p.kind}.png`), Buffer.from(data, "base64"));
            }
        }
        failed += problems.length;
    }
} finally {
    cdp?.close();
    child.kill();
    server?.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
console.log(failed ? `\n${failed} problem(s).` : "\nNo problems.");
process.exit(failed ? 1 : 0);
