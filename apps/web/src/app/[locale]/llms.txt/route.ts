import { getTranslations } from "next-intl/server";

import { LOCALES, parseLocale } from "@yonetim/i18n";
import { llmsTxt } from "@yonetim/seo";

import { getContent } from "@/content";
import { llmsStrings } from "@/lib/llms-strings";

/** SPEC Bölüm 10.2 — /llms.txt, her dil için ayrı (GEO). */
export const dynamic = "force-static";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = parseLocale(raw);
  const t = await getTranslations({ locale, namespace: "marketing" });
  const content = getContent(locale);

  const body = llmsTxt({
    locale,
    pathPrefix: locale === "tr" ? "" : `/${locale}`,
    strings: await llmsStrings(locale),
    featureSummaries: content.killerFeatures.map((f) => ({
      title: f.title,
      description: f.description,
    })),
    faqs: content.faqs,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Content-Language": locale,
      // Aynı içeriğin diğer dildeki sürümü.
      Link: LOCALES.filter((l) => l !== locale)
        .map((l) => `<${t("nav.blog") ? "" : ""}/${l}/llms.txt>; rel="alternate"; hreflang="${l}"`)
        .join(", "),
    },
  });
}
