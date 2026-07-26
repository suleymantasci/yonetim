import { siteConfig } from "@yonetim/config";
import { DEFAULT_LOCALE, LOCALE_META, LOCALES, type Locale } from "@yonetim/i18n";

/**
 * schema.org JSON-LD üreticileri — SPEC Bölüm 10.1.
 *
 * Arama motorlarına verilen metinler sayfanın diliyle aynı olmalıdır; bu yüzden
 * çeviri gerektiren alanlar (`description`, `featureList`) çağıran taraftan
 * geçirilir — paket dile bağımsız kalır.
 */
export function organizationSchema(params: {
  description: string;
  locale?: Locale;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.brand.name,
    legalName: siteConfig.brand.legalName,
    url: siteConfig.env.baseUrl,
    logo: `${siteConfig.env.baseUrl}${siteConfig.brand.logo.light}`,
    description: params.description,
    inLanguage: LOCALE_META[params.locale ?? DEFAULT_LOCALE].htmlLang,
    address: {
      "@type": "PostalAddress",
      addressLocality: siteConfig.brand.contact.address,
      addressCountry: "TR",
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: siteConfig.brand.contact.phone,
      email: siteConfig.brand.contact.email,
      contactType: "customer support",
      availableLanguage: LOCALES.map((l) => LOCALE_META[l].htmlLang),
    },
  };
}

export function softwareApplicationSchema(params: {
  ratingValue?: number;
  ratingCount?: number;
  lowestPriceTl: number;
  description: string;
  /** Çevrilmiş özellik listesi (`marketing.home.schemaFeature.*`). */
  featureList: string[];
  locale?: Locale;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.brand.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Property Management Software",
    operatingSystem: "Web",
    description: params.description,
    inLanguage: LOCALE_META[params.locale ?? DEFAULT_LOCALE].htmlLang,
    offers: {
      "@type": "Offer",
      price: params.lowestPriceTl,
      priceCurrency: "TRY",
      priceValidUntil: `${new Date().getFullYear() + 1}-12-31`,
availability: "https://schema.org/InStock",
    },
    ...(params.ratingValue && params.ratingCount
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: params.ratingValue,
            ratingCount: params.ratingCount,
          },
        }
      : {}),
    featureList: params.featureList,
  };
}

/** Her site için public landing page (Bölüm 6.14 + 3.9). */
export function apartmentComplexSchema(params: {
  name: string;
  slug: string;
  city?: string | null;
  district?: string | null;
  address?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  unitCount: number;
  photoUrls?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": ["ApartmentComplex", "LocalBusiness"],
    name: params.name,
    url: `${siteConfig.env.baseUrl}/${params.slug}`,
    numberOfAccommodationUnits: params.unitCount,
    ...(params.photoUrls?.length ? { photo: params.photoUrls } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: params.address ?? undefined,
      addressLocality: params.district ?? undefined,
      addressRegion: params.city ?? undefined,
      addressCountry: "TR",
    },
    ...(params.latitude && params.longitude
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: params.latitude,
            longitude: params.longitude,
          },
        }
      : {}),
  };
}

export function faqSchema(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.question,
      acceptedAnswer: { "@type": "Answer", text: i.answer },
    })),
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function articleSchema(params: {
  title: string;
  description: string;
  slug: string;
  publishedAt: string;
  updatedAt?: string;
  author?: string;
  imageUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: params.title,
    description: params.description,
    url: `${siteConfig.env.baseUrl}/blog/${params.slug}`,
    datePublished: params.publishedAt,
    dateModified: params.updatedAt ?? params.publishedAt,
    author: { "@type": "Organization", name: params.author ?? siteConfig.brand.name },
    publisher: {
      "@type": "Organization",
      name: siteConfig.brand.name,
      logo: { "@type": "ImageObject", url: `${siteConfig.env.baseUrl}${siteConfig.brand.logo.light}` },
    },
    ...(params.imageUrl ? { image: params.imageUrl } : {}),
  };
}

export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
