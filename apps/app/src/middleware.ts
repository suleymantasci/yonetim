import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@yonetim/auth/cookie";
import { siteConfig } from "@yonetim/config";

/**
 * H-6: CSP nonce-based script policy. Her istek için rastgele bir nonce
 * üretilir, `script-src 'self' 'nonce-XXX'` ile yalnız bu nonce'a sahip
 * script'ler çalışır. `style-src` de nonce alır (Next.js inline style
 * üretebiliyor). `unsafe-inline`/`unsafe-eval` YOK.
 *
 * Nonce, request header'ında (`x-csp-nonce`) downstream component'lere
 * iletilir; layout'ta `<script nonce={nonce}>` olarak kullanılır.
 *
 * Tenant tespiti — SPEC Bölüm 13.1.
 * `[slug].app.domain` alt alan adı okunur ve `x-tenant-slug` başlığına yazılır.
 *
 * Oturum çerezi yoksa korumalı rotalar /giris'e yönlendirilir. Bu kontrol
 * çerezin **varlığına** bakıyor, geçerliliğine değil: geçerlilik kararı
 * `apps/api`'nin ve middleware edge'de çalıştığı için oraya bir tur atmak her
 * gezinmeye gecikme bindirirdi. Geçersiz çerezle giren kullanıcı sayfada
 * `requireContext()` üzerinden yine girişe düşüyor — burası kolaylık katmanı,
 * güvenlik sınırı değil.
 */
const PUBLIC_PATHS = [
  "/giris",
  "/kayit",
  "/kayit-talebi",
  "/sifre-sifirla",
  // `/kurulum` oturum İSTER ama tenant bağlamı istemez. Buraya yazılmasa da
  // çerez kontrolünden geçerdi; yazılmasının sebebi sayfanın kendi kontrolünü
  // yapıyor olması (`hasSessionCookie` → `/giris`) ve `devam` parametresinin
  // iki kez eklenmemesi.
  "/kurulum",
  "/api/webhooks",
  "/api/public",
  "/api/health",
  // Web Vitals girişten önce de ölçülüyor: giriş sayfasının LCP'si de veri.
  "/api/vitals",
  // Belge doğrulama: banka/kurum hesap açmadan belgenin gerçekliğini teyit eder
  // (SPEC Bölüm 3.6). Kişisel veri döndürmez. "/belge/dogrula",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";
  const headers = new Headers(request.headers);

  const slug = extractTenantSlug(host);
  if (slug) headers.set("x-tenant-slug", slug);
  headers.set("x-request-path", pathname);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-client-ip", forwardedFor.split(",")[0]!.trim());

  // H-6: Per-request CSP nonce. 16 byte base64 = 128 bit entropy.
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64",
  );
  headers.set("x-csp-nonce", nonce);

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSession = request.cookies.has(SESSION_COOKIE);

  const response = !isPublic && !hasSession && pathname !== "/"
    ? (() => {
        const url = request.nextUrl.clone();
        url.pathname = "/giris";
        url.searchParams.set("devam", pathname);
        return NextResponse.redirect(url);
      })()
    : NextResponse.next({ request: { headers } });

  // H-6: Content-Security-Policy with nonce. `frame-ancestors 'none'` clickjacking
  // koruması; `base-uri 'self'` <base> tag injection'ı önler; `object-src 'none'`
  // legacy plugin'leri devre dışı bırakır. Sentry + Türkçe font CDN'leri
  // `connect-src`/`font-src` ile allowlist'lendi.
  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.cloudflareinsights.com https://*.posthog.com`,
    `form-action 'self'`,
    `frame-src 'self' https://js.stripe.com`,
    `upgrade-insecure-requests`,
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
  // Strict-Transport-Security — HTTPS zorunlu; Next.js zaten yönlendiriyor
  // ama ek başlık tarayıcıların ilk ziyarette bile HTTPS'i zorunlu kılmasını sağlar.
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");

  return response;
}

/** `merkez-mahallesi.app.example.com` → `merkez-mahallesi` */
function extractTenantSlug(host: string): string | null {
  const bare = host.split(":")[0] ?? "";
  if (!bare || bare === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(bare)) return null;

  const appHost = siteConfig.domains.app;
  if (bare === appHost || bare === siteConfig.domains.base) return null;

  if (bare.endsWith(`.${appHost}`)) {
    return bare.slice(0, -(appHost.length + 1)) || null;
  }
  // Yerel geliştirme: `demo.localhost:3001`
  if (bare.endsWith(".localhost")) {
    return bare.slice(0, -".localhost".length) || null;
  }
  return null;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|ico)$).*)"],
};
