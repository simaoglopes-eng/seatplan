// Starts the real FastAPI backend for the browser tests, on a brand new
// SQLite database inside a temporary folder, seeded with the demo data.
// Playwright runs this file (see playwright.config.ts) and stops it with
// SIGTERM when the tests end; we then delete the temporary folder, so no
// database is ever left in the repository.
//
// Run by hand: node e2e/servers/backend.mjs   (from the frontend folder)

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(here, "../../../backend");
const apiPort = process.env.E2E_API_PORT ?? "8765";
const webPort = process.env.E2E_WEB_PORT ?? "4317";

/** The project's virtual environment locally; plain "python" in CI, where setup-python provides it. */
function pythonPath() {
  if (process.env.E2E_PYTHON) return process.env.E2E_PYTHON;
  const venv = resolve(backendDir, "../.venv/bin/python");
  return existsSync(venv) ? venv : "python";
}

const folder = mkdtempSync(join(tmpdir(), "seatplan-e2e-"));
const env = {
  ...process.env,
  DATABASE_URL: `sqlite:///${join(folder, "e2e.db")}`,
  // A fresh random key per run: sessions from an older run can never be reused.
  SECRET_KEY: randomBytes(32).toString("hex"),
  DEMO_MODE: "1",
  // No demo key: nobody, not even a test, can wipe the data through /api/demo/reset.
  DEMO_KEY: "",
  FRONTEND_ORIGIN: `http://127.0.0.1:${webPort}`,
  PUBLIC_BASE_URL: `http://127.0.0.1:${webPort}`,
  // Emails stay in the outbox (console provider); nothing is ever sent.
  EMAIL_PROVIDER: "console",
  EMAIL_ALLOWLIST: "",
};
// The demo passwords must be the public local defaults the tests type in.
delete env.DEMO_ORGANISER_PASSWORD;
delete env.DEMO_STAFF_PASSWORD;

function cleanUp() {
  rmSync(folder, { recursive: true, force: true });
}

const python = pythonPath();
const seed = spawnSync(python, ["-m", "app.seed.run"], { cwd: backendDir, env, encoding: "utf8" });
if (seed.status !== 0) {
  process.stderr.write(seed.stdout ?? "");
  process.stderr.write(seed.stderr ?? "");
  cleanUp();
  process.exit(1);
}
process.stdout.write("e2e backend: demo data seeded in a temporary SQLite database\n");

const server = spawn(
  python,
  ["-m", "uvicorn", "app.main:create_app", "--factory", "--host", "127.0.0.1", "--port", apiPort, "--log-level", "warning"],
  { cwd: backendDir, env, stdio: "inherit" },
);

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => {
  cleanUp();
  process.exit(stopping ? 0 : (code ?? 1));
});
