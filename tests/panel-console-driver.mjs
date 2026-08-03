import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiCwd = path.join(root, "apps", "api");
const apiPort = "3130";
const appPort = "3131";
const appSmoke = "/tmp/yonetim-app-build-verify";
const fs = await import("node:fs/promises");

const apiChild = spawn(
  process.execPath,
  ["-r", "ts-node/register", "-r", "tsconfig-paths/register", "src/main.ts"],
  {
    cwd: apiCwd,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: apiPort,
      REDIS_URL: "redis://127.0.0.1:6399",
      RATE_LIMIT_FAIL_OPEN: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
apiChild.stderr.on("data", (chunk) => process.stderr.write(`[api stderr] ${chunk}`));

await fs.rm(appSmoke, { recursive: true, force: true });
await fs.mkdir(`${appSmoke}/apps/app`, { recursive: true });
await fs.cp(root, appSmoke, {
  recursive: true,
  filter: (src) =>
    !src.includes("node_modules") &&
    !src.includes(".next") &&
    !src.includes(".env") &&
    !src.includes("tests") &&
    !src.includes("docs/"),
});
await fs.symlink(
  path.join(root, "node_modules"),
  path.join(appSmoke, "node_modules"),
  "dir",
);
await fs.symlink(
  path.join(root, "apps/app/node_modules"),
  path.join(appSmoke, "apps/app/node_modules"),
  "dir",
);

const nextBin = path.join(root, "node_modules", ".bin", "next");
const appWork = path.join(appSmoke, "apps", "app");

const buildChild = spawn(
  process.execPath,
  [nextBin, "build"],
  {
    cwd: appWork,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: `http://localhost:${appPort}`,
      NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
buildChild.stderr.on("data", (chunk) => process.stderr.write(`[app build stderr] ${chunk}`));
await new Promise((resolve, reject) => {
  buildChild.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`next build exit=${code}`)),
  );
  buildChild.on("error", reject);
});

const startChild = spawn(
  process.execPath,
  [nextBin, "start", "--port", appPort],
  {
    cwd: appWork,
    env: {
      ...process.env,
      PORT: appPort,
      API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
      NEXT_PUBLIC_APP_URL: `http://localhost:${appPort}`,
      NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
      CORS_ORIGINS: `http://localhost:${appPort}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
startChild.stderr.on("data", (chunk) => process.stderr.write(`[app stderr] ${chunk}`));

async function waitFor(url) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // try again
    }
    await sleep(500);
  }
  throw new Error(`URL erişilemedi: ${url}`);
}

let cleanup = async () => {};

try {
  await waitFor(`http://127.0.0.1:${apiPort}/health`);
  await waitFor(`http://127.0.0.1:${appPort}/giris`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleEvents = [];
  page.on("console", (msg) => consoleEvents.push({ type: msg.type(), text: msg.text() }));
  const pageErrors = [];
  page.on("pageerror", (err) =>
    pageErrors.push({ name: err.name, message: err.message, stack: err.stack }),
  );
  const requestFailures = [];
  page.on("requestfailed", (req) =>
    requestFailures.push({ url: req.url(), failure: req.failure()?.errorText ?? null }),
  );
  const responses = [];
  page.on("response", (res) => responses.push({ status: res.status(), url: res.url() }));

  const base = `http://127.0.0.1:${appPort}`;
  const gotoPaths = ["/giris", "/panel"];
  for (const pathName of gotoPaths) {
    consoleEvents.length = 0;
    pageErrors.length = 0;
    requestFailures.length = 0;
    responses.length = 0;
    try {
      await page.goto(base + pathName, { waitUntil: "networkidle", timeout: 20_000 });
    } catch (error) {
      pageErrors.push({ name: "goto", message: error.message });
    }
    await sleep(800);
    console.log(`\n=== ${pathName} ===`);
    console.log(
      `status_codes: ${JSON.stringify(
        responses.filter((r) => r.status >= 400).map((r) => `${r.status} ${r.url}`),
      )}`,
    );
    console.log(`request_failures: ${JSON.stringify(requestFailures)}`);
    console.log(
      `console_errors: ${JSON.stringify(consoleEvents.filter((e) => e.type === "error"))}`,
    );
    console.log(
      `console_warnings: ${JSON.stringify(consoleEvents.filter((e) => e.type === "warning"))}`,
    );
    console.log(`page_errors: ${JSON.stringify(pageErrors)}`);
  }

  await context.close();
  await browser.close();
} finally {
  cleanup = async () => {
    apiChild.kill("SIGTERM");
    startChild.kill("SIGTERM");
    await sleep(1500);
    apiChild.kill("SIGKILL");
    startChild.kill("SIGKILL");
  };
  await cleanup();
}
