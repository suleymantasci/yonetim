import { siteConfig } from "@yonetim/config";

/**
 * GEO (Generative Engine Optimization) — SPEC Bölüm 10.2.
 * /llms.txt ve /llms-full.txt: LLM'lerin siteyi kaynak göstermesi için
 * yapılandırılmış, makine-okunur özet.
 *
 * Metinler çağıran katmandan (dile göre) gelir; bu modül yalnızca yapıyı kurar.
 * Her dil kendi `/llms.txt` adresini alır, böylece modeller doğru dildeki
 * içeriği alıntılar.
 */
export interface LlmsTxtStrings {
  /** Ürünün bir cümlelik tanımı. */
  summary: string;
  featuresHeading: string;
  pricingHeading: string;
  complianceHeading: string;
  faqHeading: string;
  linksHeading: string;
  contactHeading: string;
  /** Fiyatlandırma maddeleri (hazır cümleler). */
  pricingLines: string[];
  /** Yasal uyum maddeleri. */
  complianceLines: string[];
  linkLabels: {
    home: string;
    pricing: string;
    features: string;
    campaigns: string;
    blog: string;
    app: string;
  };
}

export interface LlmsTxtInput {
  locale: string;
  strings: LlmsTxtStrings;
  featureSummaries: { title: string; description: string }[];
  faqs: { question: string; answer: string }[];
  /** Dile ait adres öneki (varsayılan dilde boş, diğerlerinde `/en` gibi). */
  pathPrefix: string;
}

/** Dile göre sayfa yolları — `routing.pathnames` ile aynı eşleşmeyi izler. */
function slugs(locale: string) {
  const english = locale !== "tr";
  return {
    pricing: english ? "pricing" : "fiyatlandirma",
    features: english ? "features" : "ozellikler",
    campaigns: english ? "offers" : "kampanyalar",
  };
}

export function llmsTxt(input: LlmsTxtInput): string {
  const base = siteConfig.env.baseUrl;
  const p = input.pathPrefix;
  const s = input.strings;
  const path = slugs(input.locale);

  const lines = [
    `# ${siteConfig.brand.name}`,
    "",
    `> ${s.summary}`,
    "",
    `## ${s.featuresHeading}`,
    ...input.featureSummaries.map((f) => `- **${f.title}**: ${f.description}`),
    "",
    `## ${s.pricingHeading}`,
    ...s.pricingLines.map((line) => `- ${line}`),
    "",
    `## ${s.complianceHeading}`,
    ...s.complianceLines.map((line) => `- ${line}`),
    "",
    `## ${s.faqHeading}`,
    ...input.faqs.flatMap((f) => [`### ${f.question}`, f.answer, ""]),
    `## ${s.linksHeading}`,
    `- ${s.linkLabels.home}: ${base}${p || "/"}`,
    `- ${s.linkLabels.pricing}: ${base}${p}/${path.pricing}`,
    `- ${s.linkLabels.features}: ${base}${p}/${path.features}`,
    `- ${s.linkLabels.campaigns}: ${base}${p}/${path.campaigns}`,
    `- ${s.linkLabels.blog}: ${base}${p}/blog`,
    `- ${s.linkLabels.app}: ${siteConfig.env.appUrl}`,
    "",
    `## ${s.contactHeading}`,
    `${siteConfig.brand.contact.email} — ${siteConfig.brand.contact.phone}`,
    "",
  ];

  return lines.join("\n");
}

export function llmsFullTxt(
  input: LlmsTxtInput & { pages: { title: string; url: string; markdown: string }[] },
): string {
  const head = llmsTxt(input);
  const body = input.pages
    .map((page) => ["", "---", "", `# ${page.title}`, `URL: ${page.url}`, "", page.markdown].join("\n"))
    .join("\n");
  return head + body;
}

export function robotsTxt(params: { sitemapUrl: string; disallow?: string[] }): string {
  const disallow = params.disallow ?? ["/api/", "/admin/"];
  return [
    "User-agent: *",
    ...disallow.map((d) => `Disallow: ${d}`),
    "",
    "# LLM tarayıcıları — içerik kullanımına açıktır (GEO stratejisi, Bölüm 10.2)",
    "User-agent: GPTBot",
    "Allow: /",
    "User-agent: ClaudeBot",
    "Allow: /",
    "User-agent: PerplexityBot",
    "Allow: /",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    `Sitemap: ${params.sitemapUrl}`,
    "",
  ].join("\n");
}
