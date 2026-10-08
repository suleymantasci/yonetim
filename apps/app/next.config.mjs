import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

import { loadRootEnv } from "../../env-loader.mjs";

// Next.js `.env`'i yalnızca bu dizinden okur; monorepo kökündeki tek `.env`
// dosyası sunucu başlamadan önce buradan yüklenir (mevcut env değişkenlerini ezmez).
loadRootEnv();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Paket boyutu analizi — GAP 4.8.2 (MIMARI-PLAN §14 Track D).
 * `ANALYZE=true pnpm --filter @yonetim/app build` ile rapor üretilir.
 */
const withAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Server Action gövde sınırı (Next varsayılanı 1 MB). Geçiş sihirbazı 5 MB'a
   * kadar dosya, banka ekstresi CSV'yi metin olarak gönderiyor; 1 MB'ı aşınca
   * istek aksiyona ulaşmadan 500 dönüyor ve form doğrulaması hiç çalışmıyordu.
   * Asıl dosya yüklemeleri (Belgeler) imzalı URL ile doğrudan depoya gider.
   */
  experimental: {
    serverActions: { bodySizeLimit: "6mb" },
    // `forbidden()` — yetkisiz sayfa genel hata ekranına düşmesin.
    authInterrupts: true,
  },
  /**
   * Workspace paketleri kaynak TypeScript olarak yayınlanıyor; Next bunları
   * kendisi derliyor.
   *
   * Liste A5'te **kısaldı**: `@yonetim/db`, `jobs`, `payment`, `whatsapp`,
   * `sms`, `emails`, `notifications`, `bank` artık `apps/app`'in bağımlılığı
   * değil (§8.3 değişmez 3); `seo`, `pricing`, `campaigns` ise hiç import
   * edilmiyor. Burada bırakmak zararsız görünürdü ama yanıltıcı olurdu —
   * yapılandırma dosyası, mimarinin bugünkü hâlini anlatmalı.
   */
  /**
   * Rapor PDF'leri (`src/lib/pdf`) pdfkit ile sunucuda üretiliyor. Paketlenirse
   * fontkit/pdfkit'in kendi dosya okumaları (`__dirname/data`) kırılıyor;
   * node_modules'tan olduğu gibi yüklensin.
   */
  serverExternalPackages: ["pdfkit"],
  transpilePackages: [
    "@yonetim/ui",
    "@yonetim/config",
    "@yonetim/core",
    "@yonetim/i18n",
    "@yonetim/auth",
    "@yonetim/dues",
    "@yonetim/kvkk",
    "@yonetim/contracts",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};
export default withAnalyzer(withNextIntl(nextConfig));
