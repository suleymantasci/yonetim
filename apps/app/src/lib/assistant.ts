/**
 * Dijital Asistan kurulumu — sunucu tarafında, istek anında okunur (imaj yeniden
 * derlenmeden açılıp kapanabilsin). Üçü de doluysa panel script'i yükler.
 */
export function assistantInstall(): { origin: string; src: string; installation: string; verification: string } | null {
  const origin = assistantOrigin();
  const installation = process.env.DA_INSTALLATION_ID ?? "";
  const verification = process.env.DA_VERIFICATION ?? "";
  if (!origin || !/^[0-9a-f-]{36}$/i.test(installation) || !/^[A-Za-z0-9_-]{43}$/.test(verification)) return null;
  return { origin, src: `${origin}/embed.js`, installation, verification };
}

export function assistantOrigin(): string | null {
  try {
    const url = new URL(process.env.DA_ORIGIN ?? "");
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
