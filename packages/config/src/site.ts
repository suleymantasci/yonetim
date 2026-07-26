/**
 * SPEC Bölüm 4.4 — Merkezi Konfigürasyon.
 *
 * KURAL: Kodun hiçbir yerinde "yonetimcell.com" gibi hardcoded string olmamalı.
 * Domain / marka / renk / font netleşince SADECE BU DOSYA değişir.
 */
export const siteConfig = {
  // === KİMLİK (değişecek) ===
  brand: {
    name: "Yönetimcell", // [DEĞİŞECEK] Marka adı
    shortName: "Yönetimcell", // [DEĞİŞECEK] Kısa ad
    tagline: "Site Yönetiminin Dijital Adresi", // [DEĞİŞECEK]
    legalName: "Yönetimcell Yazılım A.Ş.", // [DEĞİŞECEK] Kuruluş sonrası
    description:
      "Türkiye'nin ilk AI-augmented, WhatsApp-native, multi-tenant site yönetim platformu. " +
      "Aidat, gider, duyuru, bakım, anket, toplantı ve icra takibi tek panelde.",
    logo: {
      light: "/logo-light.svg", // [DEĞİŞECEK]
      dark: "/logo-dark.svg", // [DEĞİŞECEK]
      favicon: "/favicon.ico", // [DEĞİŞECEK]
    },
    contact: {
      email: "destek@yonetimcell.com.tr", // [DEĞİŞECEK]
      phone: "+90 282 606 01 90", // [DEĞİŞECEK]
      address: "Çorlu, Tekirdağ", // [DEĞİŞECEK]
    },
    social: {
      x: "", // [DEĞİŞECEK]
      linkedin: "", // [DEĞİŞECEK]
      youtube: "", // [DEĞİŞECEK]
    },
  },

  // === DOMAIN ===
  domains: {
    base: "yonetimcell.com.tr", // [DEĞİŞECEK] Ana domain
    app: "app.yonetimcell.com.tr", // [DEĞİŞECEK] App subdomain
    admin: "admin.yonetimcell.com.tr", // [DEĞİŞECEK] Super admin
    api: "api.yonetimcell.com.tr", // [DEĞİŞECEK] API
    cdn: "cdn.yonetimcell.com.tr", // [DEĞİŞECEK] Static asset
    mail: "mail.yonetimcell.com.tr", // [DEĞİŞECEK] E-posta
    wildcard: "*.yonetimcell.com.tr", // [DEĞİŞECEK] Tenant subdomain
  },

  // === ENV OVERRIDE (Cloudflare / Vercel) ===
  env: {
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "https://yonetimcell.com.tr",
    appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://app.yonetimcell.com.tr",
    adminUrl: process.env.NEXT_PUBLIC_ADMIN_URL || "https://admin.yonetimcell.com.tr",
  },

  // === GÖRSEL KİMLİK (Bölüm 12) ===
  design: {
    colors: {
      primary: "#0F4C81", // [DEĞİŞEBİLİR] Kurumsal lacivert
      secondary: "#06B6D4", // [DEĞİŞEBİLİR] Turkuaz
      accent: "#F59E0B", // [DEĞİŞEBİLİR] Amber
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#EF4444",
      background: "#FFFFFF",
      foreground: "#0F172A",
      /** Koyu temanın zemin rengi — tarayıcı çubuğu (`themeColor`) için gerekir. */
      backgroundDark: "#0A0F1A",
      foregroundDark: "#E8EDF6",
    },
    fonts: {
      heading: "Plus Jakarta Sans", // [SEÇİLECEK] Bölüm 12.2
      body: "Inter", // [SEÇİLECEK] Bölüm 12.2
      mono: "JetBrains Mono", // [SEÇİLECEK] Bölüm 12.2
    },
    radius: {
      card: "8px",
      input: "4px",
      modal: "16px",
    },
    /** Bölüm 11.5 — 60+ yaş sakin için minimum font boyutu. */
    minFontSizePx: 14,
  },

  // === İŞ KURALLARI (Bölüm 2.3 + 15 + 16) ===
  billing: {
    trial: {
      durationDays: 30,
      requiresCard: false,
      /** Deneme bitince veri bu süre kadar bekletilir, sonra arşiv (Bölüm 2.3). */
      dataRetentionMonthsAfterTrial: 6,
    },
    currency: "TRY",
    defaultPeriod: "yearly",
    refundPeriodDays: 14,
    smsOverageUnitCost: 0.3, // ₺ / SMS (Bölüm 15.4)
    maxYearlyPriceIncreasePct: 30,
    /** Lisans bitiminde tanınan ek süre (Bölüm 2.3). */
    graceDaysAfterExpiry: 30,
    /** KDV oranı (SaaS hizmeti). */
    vatRate: 0.2,
    /** Dunning adımları (Bölüm 15.3) — gün: aksiyon. */
    dunningSteps: [
      { day: 1, action: "email" },
      { day: 3, action: "sms" },
      { day: 7, action: "email_and_in_app" },
      { day: 14, action: "suspend_read_only" },
      { day: 30, action: "archive" },
    ],
  },

  // === YASAL (Türkiye) ===
  legal: {
    country: "TR",
    timezone: "Europe/Istanbul",
    locale: "tr-TR",
    currency: "TRY",
    taxIdLength: 10, // VKN
    tcknLength: 11,
    ibanLength: 26,
    phoneCountryCode: "+90",
    /** KVKK md.11 yanıt süresi (Bölüm 14.1). */
    kvkkResponseHours: 72,
    /** 5651 sayılı Kanun — log saklama (Bölüm 14.3). */
    logRetentionDays: 365,
    /** Pasif sakin verisinin anonimleştirilmeden önce saklandığı süre. */
    passiveResidentRetentionYears: 2,
  },

  // === BİLDİRİM (Bölüm 8) ===
  notifications: {
    /** Bu saat aralığında acil olmayan bildirim gönderilmez, sabaha ertelenir. */
    quietHours: { start: 22, end: 8 },
    /** Ertelenen bildirimin gönderileceği saat. */
    deferredSendHour: 9,
    /** Aidat hatırlatma: vade - N gün. */
    duesReminderDaysBefore: 5,
    /** Gecikme uyarısı: vade + N gün. */
    lateWarningDaysAfter: 7,
    /** Bakım hatırlatma günleri (Bölüm 3.7). */
    maintenanceReminderDays: [30, 15, 7, 0, -3],
    /** Toplantı davet hatırlatma günleri (Bölüm 6.6). */
    meetingReminderDays: [15, 7, 1],
  },

  // === AIDAT / BORÇ (Bölüm 6.1) ===
  dues: {
    /** KMK md.20: aylık %5 gecikme tazminatı üst sınırı. */
    monthlyLateFeePct: 5,
    /** İcra sürecine devir eşiği (Bölüm 3.5). */
    legalActionThresholdDays: 90,
    /** Erken ödeme indirimi (Bölüm 6.1 Gelişmiş). */
    earlyPaymentDiscountPct: 3,
    /** Yıllık peşin ödeme indirimi. */
    annualPrepayDiscountPct: 10,
  },

  // === SLA (Bölüm 6.3) ===
  sla: {
    critical: { hours: 4, label: "Kritik" },
    high: { hours: 24, label: "Yüksek" },
    normal: { hours: 72, label: "Normal" },
    low: { hours: 168, label: "Düşük" },
  },

  // === AI (Bölüm 9) ===
  ai: {
    enabled: false,
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    fallbackModel: "gpt-4o-mini",
    monthlyBudgetUsd: 50,
    /** BYOK: kurumsal müşteri kendi anahtarını girerse maliyet bize yansımaz. */
    allowBringYourOwnKey: true,
    /** Pattern matching bu skorun altında kalırsa AI fallback devreye girer. */
    intentConfidenceThreshold: 0.6,
  },

  // === ÖZELLİK FLAG'LERİ (Bölüm 12 + 22) ===
  features: {
    whatsappBot: true,
    smsNotify: true,
    bankIntegration: true,
    campaignsEngine: true,
    kvkkAudit: true,
    icraModule: true,
    npsAutomation: true,
    reservations: true,
    marketplace: false,
    carbonReport: true,
    aiFallback: false, // AI sadece fallback
    multiLanguage: false, // V2'de açılacak
  },

  // === i18n (Bölüm 4.2) ===
  i18n: {
    defaultLocale: "tr",
    locales: ["tr", "en", "ar", "ru", "de"],
    rtlLocales: ["ar"],
  },

  // === PERFORMANS HEDEFLERİ (Bölüm 19.1) ===
  performance: {
    ttfbMsP95: 200,
    lcpMs: 2500,
    inpMs: 200,
    cls: 0.1,
    apiMsP95: 500,
  },
} as const;

export type SiteConfig = typeof siteConfig;

/** Tenant public landing page adresi (Bölüm 6.14). */
export function tenantLandingUrl(slug: string): string {
  return `${siteConfig.env.baseUrl}/${slug}`;
}

/** Tenant uygulama adresi — subdomain (Bölüm 13.1). */
export function tenantAppUrl(slug: string): string {
  const appHost = siteConfig.domains.app;
  const proto = siteConfig.env.appUrl.startsWith("http://") ? "http" : "https";
  return `${proto}://${slug}.${appHost.split(".").slice(1).join(".") || appHost}`;
}
