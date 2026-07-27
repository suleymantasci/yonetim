import { NextResponse } from "next/server";

/**
 * WhatsApp Cloud API webhook — SPEC Bölüm 3.1 / 3.2 / 7.5.
 *
 * Bot mantığı `apps/api`'de (`/v1/webhooks/whatsapp`): her mesaj borç bakiyesi
 * okuyor, talep açıyor ve konuşma durumunu kalıcılaştırıyor.
 *
 * Bu dosya adresi koruyan ince bir aktarım. İki ayrıntı kritik:
 *
 *  1. **Gövde bayt bayt aktarılıyor.** İmza ham gövde üzerinden HMAC'leniyor;
 *     JSON'a çevirip yeniden serialize etmek imzayı bozar.
 *  2. **`x-hub-signature-256` başlığı taşınıyor.** Doğrulamayı burada yapıp
 *     "doğrulandı" demek, API'yi bu sürecin dürüstlüğüne bağımlı kılardı;
 *     doğrulama verinin sahibinde kalıyor.
 */
export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL ?? "http://localhost:3100";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const res = await fetch(`${API}/v1/webhooks/whatsapp${url.search}`, {
    cache: "no-store",
  });
  // Meta düz metin challenge bekliyor, JSON değil.
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  const res = await fetch(`${API}/v1/webhooks/whatsapp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-hub-signature-256": signature } : {}),
      "x-request-id": request.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
    body: raw,
    cache: "no-store",
  });

  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
