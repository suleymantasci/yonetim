import { parse } from "cookie";
import type { IncomingHttpHeaders } from "node:http";

import { SESSION_COOKIE } from "@yonetim/auth/cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfRequest {
  method: string;
  headers: IncomingHttpHeaders;
}

export interface SafeOriginConfig {
  corsOrigins: string;
  isProduction: boolean;
  port: number;
}

export function buildSafeOrigins(config: SafeOriginConfig): Set<string> {
  const origins = new Set<string>();
  for (const raw of config.corsOrigins.split(",")) {
    const origin = normalizeOrigin(raw);
    if (origin) origins.add(origin);
  }

  if (!config.isProduction) {
    for (const port of [3000, 3001, config.port]) {
      origins.add(`http://localhost:${port}`);
      origins.add(`https://localhost:${port}`);
      origins.add(`http://127.0.0.1:${port}`);
      origins.add(`https://127.0.0.1:${port}`);
    }
  }

  return origins;
}

export function requiresCookieCsrf(request: CsrfRequest): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false;
  if (headerValue(request.headers.authorization)) return false;

  const cookieHeader = headerValue(request.headers.cookie);
  if (!cookieHeader) return false;
  try {
    return Boolean(parse(cookieHeader)[SESSION_COOKIE]);
  } catch {
    return false;
  }
}

export function isSafeCsrfRequest(
  request: CsrfRequest,
  safeOrigins: ReadonlySet<string>,
): boolean {
  const origin = normalizeOrigin(headerValue(request.headers.origin));
  if (origin && safeOrigins.has(origin)) return true;

  const referer = headerValue(request.headers.referer);
  if (!referer) return false;
  try {
    return safeOrigins.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
