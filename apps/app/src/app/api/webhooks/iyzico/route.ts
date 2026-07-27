import { NextResponse } from "next/server";

/**
 * iyzico ödeme dönüşü — SPEC Bölüm 7.1.
 *
 * İşin tamamı `apps/api`'de (`POST /v1/webhooks/iyzico`): ödemenin doğrulanması,
 * mahsup ve tekrar koruması tek transaction içinde olmalı ve o transaction
 * veritabanının sahibinde açılır.
 *
 * Bu dosya yalnız **adresi** koruyor: iyzico paneline kayıtlı callback URL'i
 * bu origin'i gösteriyor ve sağlayıcı tarafında adres değiştirmek ayrı bir
 * operasyon. Form gövdesi JSON'a çevrilip iletiliyor; iyzico callback'i
 * `application/x-www-form-urlencoded` gönderiyor.
 */
export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:3100";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  if (!token) return NextResponse.json({ error: "token yok" }, { status: 400 });

  const res = await fetch(`${API}/v1/webhooks/iyzico`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": request.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });

  // Gövde olduğu gibi geçiyor: sağlayıcı yeniden deneme kararını durum koduna
  // göre veriyor, araya girip onu maskelemek yeniden teslimi bozardı.
  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
