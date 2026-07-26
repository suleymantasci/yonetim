import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { RATE_LIMITS, rateLimit } from "@yonetim/auth";
import { currentPeriod, periodKey } from "@yonetim/core";
import { npsResponses, tenants, withBypassRls } from "@yonetim/db";

/** Public NPS widget — SPEC Bölüm 3.8 / 6.14. Kimlik bilgisi toplamaz. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const slug = String(form.get("tenantSlug") ?? "");
  const score = Number(form.get("score"));

  if (!slug || !Number.isInteger(score) || score < 0 || score > 10) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const limit = await rateLimit(RATE_LIMITS.publicForm, `${slug}:${ip}`);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const tenant = await withBypassRls("nps:tenant", async (tx) => {
    const rows = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.slug, slug), eq(tenants.landingPublished, true), isNull(tenants.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  await withBypassRls("nps:insert", async (tx) => {
    await tx.insert(npsResponses).values({
      tenantId: tenant.id,
      userId: null,
      period: periodKey(currentPeriod()),
      score,
      channel: "in_app",
    });
  });

  const t = await getTranslations("app.nps");
  return NextResponse.json({ ok: true, message: t("thanks") });
}
