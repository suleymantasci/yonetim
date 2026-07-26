/**
 * KVKK uyumlu içerik filtresi — SPEC Bölüm 1.2 (Apsiyon şikayeti: WhatsApp grubunda
 * borç paylaşımı) ve Bölüm 6.4 ("X dairesi borçlu" gibi ifadeler yasak).
 *
 * Tamamen regex/keyword tabanlıdır (Bölüm 9.3: KVKK filtrelemede AI kullanılmaz).
 */

export type FindingSeverity = "block" | "warn" | "info";

export interface KvkkFinding {
  severity: FindingSeverity;
  /**
   * Bulgu kodu. Açıklama ve öneri metinleri i18n katmanındadır:
   * `kvkk.finding.<code>.message` ve `kvkk.finding.<code>.suggestion`.
   * Paket dile bağımsız kalır; yeni dil eklemek kod değişikliği gerektirmez.
   */
  code: string;
  match: string;
  index: number;
}

export interface FilterResult {
  findings: KvkkFinding[];
  blocked: boolean;
  /** Hassas ifadeler maskelenmiş güvenli metin. */
  redacted: string;
  score: number;
}

interface Rule {
  code: string;
  severity: FindingSeverity;
  pattern: RegExp;
  /** Bu kural tetiklendiğinde eşleşen metin maskelenir mi. */
  redact?: boolean;
}

const DEBT_WORDS = "borçlu|borcu var|borcunu ödemeyen|aidat ödemeyen|ödemeyenler|icralık|haciz";

const RULES: Rule[] = [
  {
    code: "unit_debt_disclosure",
    severity: "block",
    // "3 nolu daire borçlu", "A-12 borcunu ödemedi"
    pattern: new RegExp(
      `((?:[A-Za-zÇĞİÖŞÜçğıöşü]?-?\\d{1,4})\\s*(?:no(?:'?lu)?\\s*)?(?:daire|dükkan|bağımsız bölüm)?)[^.!?\\n]{0,40}(${DEBT_WORDS})`,
      "gi",
    ),
    redact: true,
  },
  {
    code: "name_debt_disclosure",
    severity: "block",
    pattern: new RegExp(
      `([A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,}\\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]{2,})[^.!?\\n]{0,40}(${DEBT_WORDS})`,
      "g",
    ),
    redact: true,
  },
  {
    code: "tckn",
    severity: "block",
    pattern: /\b[1-9]\d{10}\b/g,
    redact: true,
  },
  {
    code: "iban",
    severity: "warn",
    pattern: /\bTR\d{2}[\s]?(?:\d{4}[\s]?){5}\d{2}\b/gi,
  },
  {
    code: "phone",
    severity: "warn",
    pattern: /\b(?:0|\+90)?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g,
  },
  {
    code: "plate",
    severity: "warn",
    pattern: /\b\d{2}\s?[A-ZÇĞİÖŞÜ]{1,3}\s?\d{2,4}\b/g,
  },
  {
    code: "health",
    severity: "block",
    pattern: /\b(hastalık|kanser|engelli|psikiyatr|covid|karantina|hamile|tedavi görüyor)\b/gi,
    redact: true,
  },
  {
    code: "religion_politics",
    severity: "warn",
    pattern: /\b(dini inanç|mezhep|cemaat|siyasi parti|oy verdiği)\b/gi,
  },
  {
    code: "legal_threat",
    severity: "warn",
    pattern: /\b(icra takibi başlatılacaktır|haciz gelecek|savcılığa verilecek)\b/gi,
  },
];

export function filterContent(text: string): FilterResult {
  const findings: KvkkFinding[] = [];
  let redacted = text;

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      findings.push({
        severity: rule.severity,
        code: rule.code,
        match: m[0],
        index: m.index,
      });
      if (rule.redact) {
        redacted = redacted.split(m[0]).join(maskOf(m[0]));
      }
      if (m[0].length === 0) rule.pattern.lastIndex++;
    }
  }

  const blocked = findings.some((f) => f.severity === "block");
  const score = Math.min(
    100,
    findings.reduce((a, f) => a + (f.severity === "block" ? 40 : f.severity === "warn" ? 15 : 5), 0),
  );

  return { findings, blocked, redacted, score };
}

function maskOf(value: string): string {
  return "•".repeat(Math.min(value.length, 12));
}

/** Duyuru gönderiminde hedef kitleye göre ek uyarı (bireysel gönderim zorunluluğu). */
export function requiresIndividualDelivery(result: FilterResult): boolean {
  return result.findings.some(
    (f) => f.code === "unit_debt_disclosure" || f.code === "name_debt_disclosure",
  );
}
