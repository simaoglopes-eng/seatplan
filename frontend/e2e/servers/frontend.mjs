// Builds the frontend into a temporary folder and serves it like Vercel does:
// the built files, index.html for every other page address, the security
// headers from vercel.json on every answer, and /api forwarded to the e2e
// backend. One origin for the browser, exactly as in production.
//
// Playwright runs this file (see playwright.config.ts) and stops it with
// SIGTERM; the temporary build folder is then deleted.

import { readFileSync, existsSync, mkdtempSync, rmSync, statSync, createReadStream } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(here, "../..");
const apiPort = Number(process.env.E2E_API_PORT ?? "8765");
const webPort = Number(process.env.E2E_WEB_PORT ?? "4317");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** The same headers Vercel adds to every page (CSP, no framing, no referrer). */
function vercelHeaders() {
  const config = JSON.parse(readFileSync(resolve(frontendDir, "../vercel.json"), "utf8"));
  const headers = {};
  for (const rule of config.headers ?? []) {
    for (const { key, value } of rule.headers) headers[key] = value;
  }
  return headers;
}

const outDir = mkdtempSync(join(tmpdir(), "seatplan-e2e-web-"));
await build({ root: frontendDir, logLevel: "warn", build: { outDir, emptyOutDir: true } });
const securityHeaders = vercelHeaders();

/** Forwards one /api request to the backend and streams the answer back (the live stream too). */
function forward(req, res) {
  const upstream = request(
    { host: "127.0.0.1", port: apiPort, method: req.method, path: req.url, headers: req.headers },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("e2e proxy: backend not reachable");
  });
  req.pipe(upstream);
}

/** A built file if it exists, otherwise index.html so the React router can draw the page. */
function fileFor(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(outDir, clean);
  if (candidate.startsWith(outDir) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return join(outDir, "index.html");
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    forward(req, res);
    return;
  }
  const file = fileFor(req.url ?? "/");
  res.writeHead(200, { ...securityHeaders, "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});

server.listen(webPort, "127.0.0.1", () => {
  process.stdout.write(`e2e frontend: built app served on http://127.0.0.1:${webPort}\n`);
});

function stop() {
  server.close();
  server.closeAllConnections();
  rmSync(outDir, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
