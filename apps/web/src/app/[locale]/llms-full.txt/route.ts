import { siteConfig } from "@yonetim/config";
import { LOCALES, parseLocale } from "@yonetim/i18n";
import { llmsFullTxt } from "@yonetim/seo";

import { getContent } from "@/content";
import { llmsStrings } from "@/lib/llms-strings";

/** SPEC Bölüm 10.2 — /llms-full.txt: tüm içeriğin markdown hali, dile göre. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = parseLocale(raw);
  const content = getContent(locale);
  const prefix = locale === "tr" ? "" : `/${locale}`;
  const guidePath = locale === "tr" ? "rehber" : "guides";

  const body = llmsFullTxt({
    locale,
    pathPrefix: prefix,
    strings: await llmsStrings(locale),
    featureSummaries: content.killerFeatures.map((f) => ({
      title: f.title,
      description: f.description,
    })),
    faqs: content.faqs,
    pages: [
      ...content.posts.map((p) => ({
        title: p.title,
        url: `${siteConfig.env.baseUrl}${prefix}/blog/${p.slug}`,
        markdown: `${p.description}\n\n${p.body}`,
      })),
      ...content.guides.map((g) => ({
        title: g.title,
        url: `${siteConfig.env.baseUrl}${prefix}/${guidePath}/${g.slug}`,
        markdown: `${g.summary}\n\n${g.sections
          .map((s) => `## ${s.heading}\n${s.body}`)
          .join("\n\n")}`,
      })),
    ],
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Content-Language": locale,
    },
  });
}
