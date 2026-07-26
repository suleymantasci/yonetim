import type { MetadataRoute } from "next";

import { siteConfig } from "@yonetim/config";

/** SPEC Bölüm 10.2 — LLM tarayıcıları içeriğe açıktır (GEO stratejisi). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
    ],
    sitemap: `${siteConfig.env.baseUrl}/sitemap.xml`,
    host: siteConfig.env.baseUrl,
  };
}
