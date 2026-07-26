import { serverEnv } from "@yonetim/config";

/**
 * Hız sınırlama — SPEC Bölüm 14.2.
 * login 5/dk, API 100/dk/IP, SMS 3/saat/telefon.
 * Upstash Redis varsa dağıtık, yoksa süreç içi bellek (tek instance dev).
 */
export interface RateLimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  login: { key: "login", limit: 5, windowSeconds: 60 },
  otp: { key: "otp", limit: 3, windowSeconds: 3600 },
  sms: { key: "sms", limit: 3, windowSeconds: 3600 },
  api: { key: "api", limit: 100, windowSeconds: 60 },
  payment: { key: "payment", limit: 10, windowSeconds: 300 },
  whatsappInbound: { key: "wa_in", limit: 30, windowSeconds: 60 },
  publicForm: { key: "public_form", limit: 5, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const bucket = `rl:${rule.key}:${identifier}`;
  const url = serverEnv.redisUrl();
  const token = serverEnv.redisToken();

  if (url && token) {
    try {
      return await upstashLimit(url, token, bucket, rule);
    } catch {
      // Redis erişilemiyorsa bellek fallback (fail-open değil, fail-degraded).
    }
  }
  return memoryLimit(bucket, rule);
}

function memoryLimit(bucket: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const entry = memory.get(bucket);
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + rule.windowSeconds * 1000;
    memory.set(bucket, { count: 1, resetAt });
    return { allowed: true, remaining: rule.limit - 1, resetAt: new Date(resetAt) };
  }
  entry.count += 1;
  return {
    allowed: entry.count <= rule.limit,
    remaining: Math.max(0, rule.limit - entry.count),
    resetAt: new Date(entry.resetAt),
  };
}

async function upstashLimit(
  url: string,
  token: string,
  bucket: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", bucket],
      ["EXPIRE", bucket, String(rule.windowSeconds), "NX"],
      ["TTL", bucket],
    ]),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const data = (await res.json()) as { result: number }[];
  const count = Number(data[0]?.result ?? 1);
  const ttl = Number(data[2]?.result ?? rule.windowSeconds);
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt: new Date(Date.now() + ttl * 1000),
  };
}

/** Test/geliştirme için sayaç sıfırlama. */
export function resetRateLimits(): void {
  memory.clear();
}
