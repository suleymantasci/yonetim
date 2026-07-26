import { formatDate, formatKurus, type Kurus } from "@yonetim/core";

/**
 * Beyaz etiket makbuz — SPEC Bölüm 6.1 (her ödemede otomatik PDF makbuz).
 * Burada HTML üretilir; PDF'e dönüştürme app katmanında yapılır.
 */
export interface ReceiptData {
  receiptNo: string;
  tenantName: string;
  tenantAddress?: string;
  unitLabel: string;
  payerName: string;
  paidAt: Date;
  amountKurus: Kurus;
  platformFeeKurus: Kurus;
  processorFeeKurus: Kurus;
  method: string;
  items: { description: string; period?: string; amountKurus: Kurus }[];
  managerName?: string;
  verificationUrl?: string;
}

export function receiptHtml(data: ReceiptData): string {
  const rows = data.items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.description)}</td><td>${escapeHtml(i.period ?? "-")}</td>` +
        `<td class="right">${formatKurus(i.amountKurus)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<title>Makbuz ${escapeHtml(data.receiptNo)}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0F172A;padding:32px;max-width:720px;margin:0 auto}
  h1{font-size:20px;margin:0 0 4px}
  .muted{color:#64748B;font-size:13px}
  table{width:100%;border-collapse:collapse;margin:24px 0}
  th,td{padding:8px 6px;border-bottom:1px solid #E2E8F0;font-size:14px;text-align:left}
  .right{text-align:right}
  .total{font-size:18px;font-weight:700}
  .fees{background:#F8FAFC;padding:12px;border-radius:8px;font-size:13px;margin-top:16px}
  footer{margin-top:32px;font-size:12px;color:#64748B}
</style></head>
<body>
  <h1>${escapeHtml(data.tenantName)}</h1>
  <div class="muted">${escapeHtml(data.tenantAddress ?? "")}</div>
  <h2 style="font-size:16px;margin-top:24px">TAHSİLAT MAKBUZU</h2>
  <div class="muted">Makbuz No: ${escapeHtml(data.receiptNo)} • Tarih: ${formatDate(data.paidAt)}</div>
  <table>
    <thead><tr><th>Açıklama</th><th>Dönem</th><th class="right">Tutar</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="2" class="total">Toplam</td>
      <td class="right total">${formatKurus(data.amountKurus)}</td></tr></tfoot>
  </table>
  <div><strong>Ödeyen:</strong> ${escapeHtml(data.payerName)} — ${escapeHtml(data.unitLabel)}</div>
  <div><strong>Ödeme yöntemi:</strong> ${escapeHtml(data.method)}</div>
  <div class="fees">
    <strong>Şeffaf ücret gösterimi</strong><br>
    Platform hizmet bedeli: ${formatKurus(data.platformFeeKurus)}<br>
    Banka/POS komisyonu: ${formatKurus(data.processorFeeKurus)}<br>
    ${data.platformFeeKurus + data.processorFeeKurus === 0
      ? "Bu ödeme için sizden ek ücret alınmamıştır."
      : "Bu tutarlar borç tutarınıza ek olarak gösterilmektedir."}
  </div>
  <footer>
    ${data.managerName ? `Düzenleyen: ${escapeHtml(data.managerName)}<br>` : ""}
    ${data.verificationUrl ? `Doğrulama: ${escapeHtml(data.verificationUrl)}` : ""}
  </footer>
</body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Makbuz numarası: MKB-YYYY-000123 (tenant başına artan). */
export function formatReceiptNo(year: number, sequence: number): string {
  return `MKB-${year}-${String(sequence).padStart(6, "0")}`;
}
