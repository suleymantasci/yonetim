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
    "@yonetim/ui", "@yonetim/config", "@yonetim/core", "@yonetim/seo", "@yonetim/i18n",
    "@yonetim/pricing", "@yonetim/campaigns", "@yonetim/db", "@yonetim/auth", "@yonetim/dues",
    "@yonetim/payment", "@yonetim/whatsapp", "@yonetim/sms", "@yonetim/emails",
    "@yonetim/notifications", "@yonetim/kvkk", "@yonetim/bank", "@yonetim/jobs",
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
