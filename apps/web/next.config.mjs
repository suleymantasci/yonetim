import createNextIntlPlugin from "next-intl/plugin";

import { loadRootEnv } from "../../env-loader.mjs";

// Next.js `.env`'i yalnızca bu dizinden okur; monorepo kökündeki tek `.env`
// dosyası sunucu başlamadan önce buradan yüklenir (mevcut env değişkenlerini ezmez).
loadRootEnv();

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    // M-14: apps/web (pazarlama sitesi) yalnız UI + config + core + i18n + seo
    // paketlerini kullanır. Diğer paketler (db, payment, sms, whatsapp, vs.)
    // serverEnv üzerinden env okur; bunlar client bundle'a girerse API
    // anahtarları (iyzico, anthropic, resend vb.) ifşa olur. Marketing
    // sitesi client component'lerine bu paketlerin import edilmesini
    // lint kuralı ile de yasaklıyoruz (eslint-plugin-import).
    "@yonetim/ui",
    "@yonetim/config",
    "@yonetim/core",
    "@yonetim/seo",
    "@yonetim/i18n",
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
export default withNextIntl(nextConfig);
