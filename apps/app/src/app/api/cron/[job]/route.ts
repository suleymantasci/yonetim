import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { getDb } from "@yonetim/db";
import {
  applyLateFees, collectMaintenanceReminders, generateDuesForTenant, jobBySlug,
} from "@yonetim/jobs";

/**
 * Cron uç noktası — SPEC Bölüm 20 ve packages/jobs/definitions.
 * Vercel Cron veya Trigger.dev bu adresi çağırır. Yetki: CRON_SECRET.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const { job } = await params;
  const definition = jobBySlug(job);
  if (!definition) {
    return NextResponse.json({ error: "unknown_job", job }, { status: 404 });
  }
  const jobId = definition.id;

  const tenantIds = await activeTenantIds();
  const results: unknown[] = [];

  for (const tenantId of tenantIds) {
    switch (jobId) {
      case "dues.generate-monthly":
        results.push(await generateDuesForTenant({ tenantId }));
        break;
      case "dues.late-fee":
        results.push(await applyLateFees({ tenantId }));
        break;
      case "maintenance.reminders":
        results.push(await collectMaintenanceReminders({ tenantId }));
        break;
      default:
        results.push({ tenantId, skipped: "no_handler", job: jobId });
    }
  }

  return NextResponse.json({ job: jobId, tenants: tenantIds.length, results });
}

async function activeTenantIds(): Promise<string[]> {
  const rows = await getDb().execute<{ id: string }>(
    sql`SELECT id FROM tenants WHERE status IN ('trial','active','past_due') AND deleted_at IS NULL`,
  );
  return (rows as unknown as { id: string }[]).map((r) => r.id);
}
