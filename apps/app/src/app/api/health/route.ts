import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getDb } from "@yonetim/db";

/** Sağlık kontrolü — SPEC Bölüm 19.3. */
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let database = "unknown";
  try {
    await getDb().execute(sql`SELECT 1`);
    database = "ok";
  } catch {
    database = "down";
  }

  const healthy = database === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
