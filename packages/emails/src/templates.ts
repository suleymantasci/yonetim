import { siteConfig } from "@yonetim/config";

/**
 * E-posta şablonları — SPEC Bölüm 7.4 / 8.2.
 *
 * Şablonlar dile bağımsızdır: metinler `t` çeviri fonksiyonu ile dışarıdan
 * gelir (`notification.email.*` namespace'i). Böylece aynı şablon her dilde
 * kullanılır ve yeni dil eklemek yalnızca mesaj dosyası eklemek demektir.
 */

/** next-intl `getTranslations` sonucuyla uyumlu minimal arayüz. */
export type Translator = (key: string, values?: Record<string, string | number>) => string;

export interface EmailContent {
  subject: string;
  html: string;
}

interface LayoutParams {
  t: Translator;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

/**
 * E-posta istemcileri CSS değişkenlerini ve `prefers-color-scheme`'i güvenilir
 * biçimde desteklemediği için burada gömülü (inline) renkler kullanılır.
 * Değerler `siteConfig.design.colors` üzerinden gelir — marka tek yerden yönetilir.
 */
const C = siteConfig.design.colors;

function layout({ t, title, bodyHtml, ctaLabel, ctaUrl, footerNote }: LayoutParams): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${C.foreground}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:${C.primary};padding:20px 24px;color:#ffffff;font-size:18px;font-weight:700">
          ${escapeHtml(siteConfig.brand.name)}
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
          <div style="font-size:15px;line-height:1.6;color:#334155">${bodyHtml}</div>
          ${
            ctaUrl
              ? `<div style="margin:24px 0"><a href="${escapeHtml(ctaUrl)}"
                   style="display:inline-block;background:${C.accent};color:#1f2937;text-decoration:none;
                   padding:12px 20px;border-radius:8px;font-weight:600">${escapeHtml(ctaLabel ?? "")}</a></div>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5">
          ${footerNote ? `${escapeHtml(footerNote)}<br><br>` : ""}
          ${escapeHtml(t("email.footer", { brand: siteConfig.brand.name }))}<br>
          ${escapeHtml(t("email.kvkkContact", { email: siteConfig.brand.contact.email }))}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Çeviri metinlerinde `<strong>` gibi basit biçimlendirme etiketlerine izin verir,
 * diğer her şeyi kaçırır. Mesaj dosyaları güvenilir kaynaktır; bu yalnızca
 * yer tutucudan gelen değerleri korumak içindir.
 */
function richText(value: string): string {
  return escapeHtml(value)
    .replace(/&lt;strong&gt;/g, "<strong>")
    .replace(/&lt;\/strong&gt;/g, "</strong>");
}

export function welcomeEmail(
  t: Translator,
  params: { name: string; property: string; loginUrl: string },
): EmailContent {
  return {
    subject: t("email.welcome.subject", { property: params.property }),
    html: layout({
      t,
      title: t("email.welcome.title", { name: params.name }),
      bodyHtml:
        `<p>${richText(t("email.welcome.body1", { property: params.property }))}</p>` +
        `<p>${escapeHtml(t("email.welcome.body2"))}</p>`,
      ctaLabel: t("email.welcome.cta"),
      ctaUrl: params.loginUrl,
    }),
  };
}

export function magicLinkEmail(
  t: Translator,
  params: { url: string; expiresMinutes: number },
): EmailContent {
  return {
    subject: t("email.magicLink.subject"),
    html: layout({
      t,
      title: t("email.magicLink.title"),
      bodyHtml:
        `<p>${escapeHtml(t("email.magicLink.body1", { minutes: params.expiresMinutes }))}</p>` +
        `<p>${escapeHtml(t("email.magicLink.body2"))}</p>`,
      ctaLabel: t("email.magicLink.cta"),
      ctaUrl: params.url,
    }),
  };
}

/**
 * Parolalı girişin ikinci adımı — tek kullanımlık kod.
 *
 * Magic link'ten farkı **bağlantı taşımaması**: burada kod, parolayı zaten
 * doğrulamış birinin ikinci faktörü. Tıklanabilir bir bağlantı koymak, e-posta
 * kutusuna erişen birinin parolayı hiç bilmeden içeri girmesi demekti —
 * ikinci faktör olmaktan çıkıp tek faktöre dönerdi.
 */
export function loginCodeEmail(
  t: Translator,
  params: { code: string; expiresMinutes: number },
): EmailContent {
  return {
    subject: t("email.loginCode.subject"),
    html: layout({
      t,
      title: t("email.loginCode.title"),
      bodyHtml:
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0">` +
        `${escapeHtml(params.code)}</p>` +
        `<p>${escapeHtml(t("email.loginCode.body1", { minutes: params.expiresMinutes }))}</p>` +
        `<p>${escapeHtml(t("email.loginCode.body2"))}</p>`,
    }),
  };
}

export function duesReminderEmail(
  t: Translator,
  params: {
    property: string;
    unit: string;
    period: string;
    amount: string;
    dueDate: string;
    payUrl: string;
  },
): EmailContent {
  return {
    subject: t("email.duesReminder.subject", { period: params.period, unit: params.unit }),
    html: layout({
      t,
      title: t("email.duesReminder.title", { period: params.period }),
      bodyHtml:
        `<p><strong>${escapeHtml(params.property)}</strong> / ${escapeHtml(params.unit)}</p>` +
        `<p>${richText(t("email.duesReminder.amountLine", { amount: params.amount }))}<br>` +
        `${escapeHtml(t("email.duesReminder.dueLine", { date: params.dueDate }))}</p>` +
        `<p>${escapeHtml(t("email.duesReminder.transparency"))}</p>`,
      ctaLabel: t("email.duesReminder.cta"),
      ctaUrl: params.payUrl,
    }),
  };
}

export function paymentReceiptEmail(
  t: Translator,
  params: { amount: string; date: string; receiptNo: string; receiptUrl: string },
): EmailContent {
  return {
    subject: t("email.receipt.subject", { receiptNo: params.receiptNo }),
    html: layout({
      t,
      title: t("email.receipt.title"),
      bodyHtml:
        `<p>${escapeHtml(t("email.receipt.amount"))}: <strong>${escapeHtml(params.amount)}</strong><br>` +
        `${escapeHtml(t("email.receipt.date"))}: ${escapeHtml(params.date)}<br>` +
        `${escapeHtml(t("email.receipt.receiptNo"))}: ${escapeHtml(params.receiptNo)}</p>`,
      ctaLabel: t("email.receipt.cta"),
      ctaUrl: params.receiptUrl,
    }),
  };
}

export function debtCertificateEmail(
  t: Translator,
  params: {
    unit: string;
    result: "clear" | "outstanding";
    serialNo: string;
    verificationCode: string;
    pdfUrl: string;
  },
): EmailContent {
  const clear = params.result === "clear";
  return {
    subject: t(clear ? "email.certificate.subjectClear" : "email.certificate.subjectOutstanding", {
      serialNo: params.serialNo,
    }),
    html: layout({
      t,
      title: t(clear ? "email.certificate.titleClear" : "email.certificate.titleOutstanding"),
      bodyHtml:
        `<p>${escapeHtml(t("email.certificate.body", { unit: params.unit }))}</p>` +
        `<p>${escapeHtml(t("email.certificate.serialNo"))}: <strong>${escapeHtml(params.serialNo)}</strong><br>` +
        `${escapeHtml(t("email.certificate.verificationCode"))}: <strong>${escapeHtml(params.verificationCode)}</strong></p>` +
        `<p>${escapeHtml(t("email.certificate.note"))}</p>`,
      ctaLabel: t("email.certificate.cta"),
      ctaUrl: params.pdfUrl,
    }),
  };
}

export function meetingInviteEmail(
  t: Translator,
  params: {
    property: string;
    title: string;
    dateText: string;
    location: string;
    agenda: string[];
    detailUrl: string;
  },
): EmailContent {
  return {
    subject: t("email.meetingInvite.subject", { property: params.property, title: params.title }),
    html: layout({
      t,
      title: params.title,
      bodyHtml:
        `<p>${escapeHtml(t("email.meetingInvite.date"))}: <strong>${escapeHtml(params.dateText)}</strong><br>` +
        `${escapeHtml(t("email.meetingInvite.location"))}: ${escapeHtml(params.location)}</p>` +
        `<p><strong>${escapeHtml(t("email.meetingInvite.agenda"))}</strong></p>` +
        `<ol>${params.agenda.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ol>` +
        `<p>${escapeHtml(t("email.meetingInvite.proxyNote"))}</p>`,
      ctaLabel: t("email.meetingInvite.cta"),
      ctaUrl: params.detailUrl,
    }),
  };
}

export function kvkkRequestEmail(
  t: Translator,
  params: { requestNo: string; dueDate: string; type: string },
): EmailContent {
  return {
    subject: t("email.kvkkRequest.subject", { requestNo: params.requestNo }),
    html: layout({
      t,
      title: t("email.kvkkRequest.title"),
      bodyHtml:
        `<p>${escapeHtml(t("email.kvkkRequest.type"))}: ${escapeHtml(params.type)}<br>` +
        `${escapeHtml(t("email.kvkkRequest.requestNo"))}: <strong>${escapeHtml(params.requestNo)}</strong></p>` +
        `<p>${richText(t("email.kvkkRequest.body", { date: params.dueDate }))}</p>`,
      footerNote: t("email.kvkkRequest.footerNote"),
    }),
  };
}

export function dunningEmail(
  t: Translator,
  params: { step: number; property: string; amount: string; updateUrl: string },
): EmailContent {
  const titleKey =
    params.step >= 14
      ? "email.dunning.title14"
      : params.step >= 7
        ? "email.dunning.title7"
        : params.step >= 3
          ? "email.dunning.title3"
          : "email.dunning.title1";
  const title = t(titleKey);

  return {
    subject: t("email.dunning.subject", { title, property: params.property }),
    html: layout({
      t,
      title,
      bodyHtml:
        `<p>${escapeHtml(t("email.dunning.body", { property: params.property, amount: params.amount }))}</p>` +
        `<p>${escapeHtml(t(params.step >= 14 ? "email.dunning.suspendedNote" : "email.dunning.updateNote"))}</p>`,
      ctaLabel: t("email.dunning.cta"),
      ctaUrl: params.updateUrl,
    }),
  };
}

export function monthlyReportEmail(
  t: Translator,
  params: {
    property: string;
    period: string;
    collectionRate: string;
    income: string;
    expense: string;
    balance: string;
    reportUrl: string;
  },
): EmailContent {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#64748b">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 0;text-align:right;font-weight:600">${escapeHtml(value)}</td></tr>`;

  return {
    subject: t("email.monthlyReport.subject", {
      property: params.property,
      period: params.period,
    }),
    html: layout({
      t,
      title: t("email.monthlyReport.title", { period: params.period }),
      bodyHtml:
        `<table style="width:100%;font-size:14px">` +
        row(t("email.monthlyReport.collectionRate"), params.collectionRate) +
        row(t("email.monthlyReport.income"), params.income) +
        row(t("email.monthlyReport.expense"), params.expense) +
        row(t("email.monthlyReport.balance"), params.balance) +
        `</table>`,
      ctaLabel: t("email.monthlyReport.cta"),
      ctaUrl: params.reportUrl,
    }),
  };
}
