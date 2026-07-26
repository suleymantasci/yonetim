/**
 * Meta onaylı şablon tanımları — SPEC Bölüm 8.2.
 * Kategori kuralı (Bölüm 8.3): marketing template kullanılmaz; hatırlatmalar utility.
 */
export type TemplateCategory = "utility" | "authentication" | "marketing";

export interface WhatsAppTemplateDef {
  name: string;
  category: TemplateCategory;
  language: "tr";
  /** {{1}}, {{2}} ... sırasıyla parametreler. */
  body: string;
  params: string[];
  /** Meta onayı için örnek değerler. */
  examples: string[];
  buttons?: { type: "url" | "quick_reply"; text: string; url?: string }[];
  estimatedCostUsd: number;
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplateDef[] = [
  {
    name: "otp_login",
    category: "authentication",
    language: "tr",
    body: "{{1}} giriş kodunuz: {{2}}. Kodu kimseyle paylaşmayın, 5 dakika geçerlidir.",
    params: ["marka", "kod"],
    examples: ["Yönetimcell", "482913"],
    estimatedCostUsd: 0.03,
  },
  {
    name: "hosgeldin",
    category: "utility",
    language: "tr",
    body:
      "Merhaba {{1}}, {{2}} yönetim sistemine hoş geldiniz. Bu numaradan borç sorgulama, ödeme ve " +
      "arıza bildirimi yapabilirsiniz. Menü için 'yardim' yazın.",
    params: ["ad", "site_adi"],
    examples: ["Ayşe Hanım", "Merkez Apartmanı"],
    estimatedCostUsd: 0.04,
  },
  {
    name: "aidat_hatirlatma",
    category: "utility",
    language: "tr",
    body:
      "{{1}} — {{2}} dönemi aidat tutarınız {{3}}. Son ödeme tarihi {{4}}. " +
      "Ödemek için 'odeme' yazabilirsiniz.",
    params: ["site_adi", "donem", "tutar", "son_odeme"],
    examples: ["Merkez Apartmanı", "Ocak 2026", "1.250,00 ₺", "10.01.2026"],
    estimatedCostUsd: 0.04,
  },
  {
    name: "aidat_gecikme_uyari",
    category: "utility",
    language: "tr",
    body:
      "{{1}} — {{2}} tarihli aidat ödemeniz gecikti. Güncel borcunuz {{3}} (gecikme tazminatı dahil). " +
      "Detay için 'borc' yazın.",
    params: ["site_adi", "vade", "tutar"],
    examples: ["Merkez Apartmanı", "10.01.2026", "1.312,50 ₺"],
    estimatedCostUsd: 0.04,
  },
  {
    name: "odeme_onay_makbuz",
    category: "utility",
    language: "tr",
    body: "Ödemeniz alındı ✅ Tutar: {{1}}, Tarih: {{2}}. Makbuz numaranız: {{3}}.",
    params: ["tutar", "tarih", "makbuz_no"],
    examples: ["1.250,00 ₺", "05.01.2026", "MKB-2026-000123"],
    estimatedCostUsd: 0.04,
  },
  {
    name: "toplanti_daveti",
    category: "utility",
    language: "tr",
    body:
      "{{1}} kat malikleri toplantısı: {{2}} tarihinde {{3}} adresinde yapılacaktır. " +
      "Gündem: {{4}}",
    params: ["site_adi", "tarih", "yer", "gundem"],
    examples: ["Merkez Apartmanı", "15.02.2026 19:00", "Site sosyal tesisi", "Bütçe onayı, yönetici seçimi"],
    estimatedCostUsd: 0.04,
  },
  {
    name: "bakim_hatirlatma",
    category: "utility",
    language: "tr",
    body: "{{1}} — {{2}} bakımı {{3}} tarihinde yapılacaktır. {{4}}",
    params: ["site_adi", "ekipman", "tarih", "not"],
    examples: ["Merkez Apartmanı", "Asansör yıllık muayene", "20.02.2026", "Asansör 2 saat kapalı olacaktır."],
    estimatedCostUsd: 0.04,
  },
  {
    name: "duyuru_genel",
    category: "utility",
    language: "tr",
    body: "📢 {{1}}\n\n{{2}}",
    params: ["baslik", "icerik"],
    examples: ["Su kesintisi", "Yarın 09:00-14:00 arası şebeke bakımı nedeniyle su verilmeyecektir."],
    estimatedCostUsd: 0.04,
  },
  {
    name: "acil_durum_override",
    category: "utility",
    language: "tr",
    body: "🚨 ACİL — {{1}}\n\n{{2}}\n\nYönetim: {{3}}",
    params: ["baslik", "icerik", "iletisim"],
    examples: ["Su baskını", "B blok bodrum katta su baskını var, araçlarınızı çıkarın.", "0532 000 00 00"],
    estimatedCostUsd: 0.04,
  },
  {
    name: "talep_durum_degisiklik",
    category: "utility",
    language: "tr",
    body: "{{1}} numaralı talebinizin durumu: {{2}}. {{3}}",
    params: ["talep_no", "durum", "not"],
    examples: ["TLP-000123", "Çözüldü", "Asansör kartı değiştirildi."],
    estimatedCostUsd: 0.04,
  },
  {
    name: "anket_daveti",
    category: "utility",
    language: "tr",
    body: "🗳️ {{1}} için oylama açıldı: {{2}}. Son katılım: {{3}}. Oy vermek için: {{4}}",
    params: ["site_adi", "konu", "son_tarih", "link"],
    examples: ["Merkez Apartmanı", "Dış cephe boyası", "20.02.2026", "https://..."],
    estimatedCostUsd: 0.04,
  },
  {
    name: "kvkk_talep_onay",
    category: "utility",
    language: "tr",
    body: "KVKK talebiniz alındı (No: {{1}}). En geç {{2}} tarihine kadar yanıtlanacaktır.",
    params: ["talep_no", "son_tarih"],
    examples: ["KVKK-2026-0007", "08.02.2026"],
    estimatedCostUsd: 0.04,
  },
  {
    name: "borcu_yoktur_belge",
    category: "utility",
    language: "tr",
    body: "'Borcu Yoktur' belgeniz hazır. Belge no: {{1}}, doğrulama kodu: {{2}}. Bağlantı: {{3}}",
    params: ["belge_no", "dogrulama_kodu", "link"],
    examples: ["BYB-2026-000045", "8KD2QF", "https://..."],
    estimatedCostUsd: 0.04,
  },
  {
    name: "nps_anket",
    category: "utility",
    language: "tr",
    body:
      "{{1}} yönetiminden memnuniyetinizi 0-10 arasında puanlar mısınız? " +
      "Yanıtınız yalnızca yöneticiye özet olarak iletilir.",
    params: ["site_adi"],
    examples: ["Merkez Apartmanı"],
    estimatedCostUsd: 0.04,
  },
  {
    name: "rezervasyon_onay",
    category: "utility",
    language: "tr",
    body: "{{1}} rezervasyonunuz onaylandı: {{2}} - {{3}}. Ücret: {{4}}",
    params: ["kaynak", "baslangic", "bitis", "ucret"],
    examples: ["Toplantı Salonu", "20.02.2026 14:00", "18:00", "500,00 ₺"],
    estimatedCostUsd: 0.04,
  },
];

export function templateByName(name: string): WhatsAppTemplateDef | undefined {
  return WHATSAPP_TEMPLATES.find((t) => t.name === name);
}

/** Şablon metnini parametrelerle doldurur (önizleme + SMS/e-posta fallback için). */
export function renderTemplate(name: string, params: string[]): string {
  const tpl = templateByName(name);
  if (!tpl) return params.join(" ");
  return tpl.body.replace(/\{\{(\d+)\}\}/g, (_, i) => params[Number(i) - 1] ?? "");
}

/** Meta'ya gönderilecek şablon kayıt gövdesi (onay başvurusu). */
export function templateRegistrationPayload(tpl: WhatsAppTemplateDef) {
  return {
    name: tpl.name,
    language: tpl.language,
    category: tpl.category.toUpperCase(),
    components: [
      {
        type: "BODY",
        text: tpl.body,
        example: { body_text: [tpl.examples] },
      },
      ...(tpl.buttons
        ? [
            {
              type: "BUTTONS",
              buttons: tpl.buttons.map((b) =>
                b.type === "url"
                  ? { type: "URL", text: b.text, url: b.url }
                  : { type: "QUICK_REPLY", text: b.text },
              ),
            },
          ]
        : []),
    ],
  };
}
