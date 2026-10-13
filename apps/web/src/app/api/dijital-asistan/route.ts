/**
 * Dijital Asistan kurulum değerleri — istek anında okunur.
 *
 * Landing sayfaları derlemede statik üretiliyor; script değerlerini HTML'e gömmek
 * her değişiklikte yeniden derleme isterdi. `AssistantScript` bu uçtan alıp
 * script'i ekliyor. Değerler zaten herkese açık (her sayfada görünür).
 */
export const dynamic = "force-dynamic";

export function GET() {
  const installation = process.env.DA_INSTALLATION_ID ?? "";
  const verification = process.env.DA_VERIFICATION ?? "";
  let origin: string | null = null;
  try {
    const url = new URL(process.env.DA_ORIGIN ?? "");
    origin = url.protocol === "https:" ? url.origin : null;
  } catch {
    origin = null;
  }
  if (!origin || !/^[0-9a-f-]{36}$/i.test(installation) || !/^[A-Za-z0-9_-]{43}$/.test(verification))
    return Response.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
  return Response.json(
    { enabled: true, src: `${origin}/embed.js`, installation, verification },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
