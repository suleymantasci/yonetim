import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiCwd = path.join(root, "apps", "api");
const port = "3110";

const child = spawn(
  process.execPath,
  ["-r", "ts-node/register", "-r", "tsconfig-paths/register", "src/main.ts"],
  {
    cwd: apiCwd,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: port,
      REDIS_URL: "redis://127.0.0.1:6399",
      RATE_LIMIT_FAIL_OPEN: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
let exited = false;
const collect = (chunk) => {
  output += String(chunk);
};
child.once("exit", () => {
  exited = true;
});
child.stdout.on("data", collect);
child.stderr.on("data", collect);

async function request(pathname, init) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (exited) {
      throw new Error(
        `API başlangıçta sonlandı; .env ve bootstrap logunu kontrol edin.\n${redactOutput(output).slice(-2_000)}`,
      );
    }
    try {
      return await fetch(`http://127.0.0.1:${port}${pathname}`, {
        ...init,
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`API ${pathname} reachable olmadı`);
}

function redactOutput(value) {
  return value
    .split(/\r?\n/)
    .filter((line) => !/(cookie|set-cookie|authorization)/i.test(line))
    .join("\n");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const live = await request("/health");
  const liveBody = await live.json();
  assert(live.status === 200, `/health status=${live.status}`);
  assert(liveBody.status === "ok", `/health body status=${liveBody.status}`);

  const ready = await request("/health/ready");
  const readyBody = await ready.json();
  assert(ready.status === 200, `/health/ready status=${ready.status}`);
  assert(
    readyBody.checks?.redis === false,
    "readiness Redis=true beklenmiyordu",
  );
  assert(
    readyBody.status === "degraded",
    "Redis yokken readiness degraded olmalı",
  );

  const publicPost = await request("/v1/auth/web/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: "test@example.com",
      password: "wrong-password",
    }),
  });
  const publicBody = await publicPost.text();
  assert(
    publicPost.status !== 403,
    `session'sız POST CSRF ile reddedildi: ${publicPost.status}`,
  );
  assert(
    !publicBody.includes("csrf_origin_check_failed"),
    "session'sız POST CSRF hatası döndürdü",
  );

  const trustedCookiePost = await request("/v1/auth/web/password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "yonetim_session=fake-session",
      origin: "http://localhost:3001",
    },
    body: JSON.stringify({
      identifier: "test@example.com",
      password: "wrong-password",
    }),
  });
  const trustedBody = await trustedCookiePost.text();
  assert(
    trustedCookiePost.status !== 403,
    `trusted Origin POST CSRF ile reddedildi: ${trustedCookiePost.status}`,
  );
  assert(
    !trustedBody.includes("csrf_origin_check_failed"),
    "trusted Origin CSRF hatası döndürdü",
  );

  const evilCookiePost = await request("/v1/auth/web/password", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "yonetim_session=fake-session",
      origin: "https://evil.example",
    },
    body: JSON.stringify({
      identifier: "test@example.com",
      password: "wrong-password",
    }),
  });
  const evilBody = await evilCookiePost.text();
  assert(
    evilCookiePost.status === 403,
    `kötü Origin status=${evilCookiePost.status}`,
  );
  assert(
    evilBody.includes("csrf_origin_check_failed"),
    "kötü Origin CSRF kodu döndürmedi",
  );

  await sleep(300);
  assert(
    !output.includes("Unhandled error event"),
    "ioredis unhandled error event üretildi",
  );
  process.stdout.write("runtime Redis/CSRF smoke: PASS\n");
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n${redactOutput(output).slice(-4_000)}`,
  );
  throw error;
} finally {
  if (!exited) child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), sleep(5_000)]);
  if (!exited) child.kill("SIGKILL");
}
