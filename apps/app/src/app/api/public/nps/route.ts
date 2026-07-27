import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";

/**
 * Halka açık NPS widget'ı — SPEC Bölüm 3.8 / 6.14.
 *
 * Kayıt ve hız sınırı `apps/api`'de (`POST /v1/public/nps`); burası formu
 * karşılayıp yanıtı **kullanıcının dilinde** üretiyor. Adres değişmedi çünkü
 * widget'ı gömen landing sayfaları bu adrese post ediyor.
 *
 * Teşekkür metninin burada olması bilinçli: API dile bağımsız (SPEC 4.2),
 * çeviri sözlüğü render katmanında.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const tenantSlug = String(form.get("tenantSlug") ?? "");
  const score = Number(form.get("score"));

  if (!tenantSlug || !Number.isInteger(score) || score < 0 || score > 10) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    await apiPost("/v1/public/nps", { tenantSlug, score });
  } catch (error) {
    if (error instanceof AppError) {
      // Kod olduğu gibi geçiyor: widget'ı gömen sayfa "rate_limited" ile
      // "tenant_not_found" arasında ayrım yapabilmeli.
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }

  const t = await getTranslations("app.nps");
  return NextResponse.json({ ok: true, message: t("thanks") });
}
