import { sql } from "drizzle-orm";

import type { Database } from "../../property/unit/types";

/**
 * Sentetik yevmiye — sistemdeki kayıtlardan çift taraflı fiş üretir.
 *
 * Mizan, yevmiye defteri ve devir bakiyeleri **aynı** fiş listesinden
 * türüyor; ayrı ayrı hesaplansalardı bir gün biri diğerini tutmazdı. Her fiş
 * kendi içinde denk (borç = alacak), bu yüzden her toplam da denk.
 *
 * Hesap eşlemesi (Tek Düzen Hesap Planı):
 *  - Aidat/borç tahakkuku     120 Alıcılar (B) / 600 · 602 · 649 (A)
 *  - Devir (açılış) borcu     120 (B) / 549 Özel fonlar (A)
 *  - Tahsilat                 100 Kasa | 102.xx Banka (B) / 120 (A)
 *  - Silinen alacak           659 (B) / 120 (A)
 *  - Gider tahakkuku          770.xx (B) / 320 Satıcılar (A)
 *  - Gider ödemesi            320 (B) / 100 | 102.xx (A)
 *  - Maaş tahakkuku           770.99 Personel giderleri (B) / 335 Personele borçlar (A)
 *  - Maaş ödemesi             335 (B) / 100 | 102.xx (A)
 *  - Avans                    196 Personel avansları (B) / 100 | 102.xx (A)
 *  - Avanstan mahsup          335 (B) / 196 (A)
 *  - Açılış fişi              100 · 102.xx · 196 (B) / 320 · 335 (A), fark 549
 *  - Virman                   hedef 100 | 102.xx (B) / kaynak 100 | 102.xx (A)
 *  - Harici tahsilat          100 | 102.xx (B) / 602.xx (A) — faiz 642
 *
 * Mahsup/kredi bakiyesiyle kapatılan tahsilatlar (`offset`, `credit_balance`)
 * nakit hareketi değil, dışarıda. Tutarlar KDV dahil: site yönetimi KDV
 * mükellefi değil, KDV giderin parçası.
 */

export interface JournalLine {
  code: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  date: Date;
  /** Sıralama için: aynı gün içinde kaynak sırası (açılış önce). */
  order: number;
  source:
    | "opening"
    | "debt"
    | "writeoff"
    | "payment"
    | "expense"
    | "expense_payment"
    | "staff"
    | "transfer"
    | "income";
  sourceId: string | null;
  description: string;
  lines: JournalLine[];
}

export const BASE_ACCOUNTS: Record<string, string> = {
  "100": "Kasa",
  "102": "Bankalar",
  "120": "Alıcılar (kat malikleri / sakinler)",
  "196": "Personel avansları",
  "320": "Satıcılar (tedarikçiler / ödenecek giderler)",
  "335": "Personele borçlar",
  "549": "Özel fonlar (devreden işletme fonu)",
  "600": "Aidat gelirleri",
  "602": "Diğer gelirler",
  "642": "Faiz gelirleri",
  "649": "Gecikme tazminatı gelirleri",
  "659": "Silinen alacaklar",
  "770": "Genel yönetim giderleri",
};

export const STAFF_EXPENSE_CODE = "770.99";
const UNCATEGORIZED_CODE = "770.00";
const UNASSIGNED_BANK_CODE = "102.00";

/** Harici tahsilat grubu → gelir alt hesabı. */
export const INCOME_ACCOUNTS: Record<string, [string, string]> = {
  rent: ["602.01", "Kira gelirleri"],
  advertising: ["602.02", "Reklam gelirleri"],
  donation: ["602.03", "Bağış ve yardımlar"],
  compensation: ["602.04", "Tazminat ve sigorta gelirleri"],
  sale: ["602.05", "Hurda / demirbaş satış gelirleri"],
  other: ["602.09", "Diğer harici gelirler"],
  interest: ["642", "Faiz gelirleri"],
};

/** Kasa ve banka hesapları (işletme defteri, kasa bakiyeleri). */
export function isCashCode(code: string): boolean {
  return code === "100" || code === "102" || code.startsWith("102.");
}

export interface Journal {
  entries: JournalEntry[];
  /** Kod → ad (alt hesaplar dahil). */
  accounts: Map<string, string>;
  /** Banka hesabı id → 102.xx (oluşturulma sırası). */
  bankCodes: Map<string, string>;
}

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);
const d = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

/**
 * `until` dahil o ana kadarki tüm fişler. Mizan devri için başlangıç
 * kısıtı yok: devir = başlangıçtan önceki her şey.
 */
export async function loadJournal(tx: Database, until: Date): Promise<Journal> {
  const end = until.toISOString();
  const q = async (query: ReturnType<typeof sql>) => (await tx.execute(query)) as unknown as Row[];

  const [banks, categories, debtRows, paymentRows, expenseRows, staffRows, openingRows, movementRows] = await Promise.all([
    q(sql`SELECT id, bank_name, account_name FROM bank_accounts ORDER BY created_at, id`),
    q(sql`SELECT id, name FROM expense_categories ORDER BY name, id`),
    q(sql`
      SELECT d.id, d.kind::text AS kind, d.description, d.amount_kurus, d.paid_kurus, d.status::text AS status,
             d.created_at, d.updated_at, d.due_date, u.number AS unit_number,
             (d.metadata ? 'opening' OR d.metadata ? 'migrated') AS opening,
             dt.account_code, dt.name AS type_name
      FROM debts d LEFT JOIN units u ON u.id = d.unit_id
      LEFT JOIN debt_types dt ON dt.id = d.debt_type_id
      WHERE d.deleted_at IS NULL AND d.status <> 'cancelled'
        AND CASE WHEN (d.metadata ? 'opening' OR d.metadata ? 'migrated') THEN d.due_date ELSE d.created_at END <= ${end}::timestamptz
    `),
    q(sql`
      SELECT p.id, p.amount_kurus - p.refunded_kurus AS amount, coalesce(p.paid_at, p.created_at) AS at,
             p.bank_account_id, p.method::text AS method, u.number AS unit_number
      FROM payments p LEFT JOIN units u ON u.id = p.unit_id
      WHERE p.status = 'completed' AND p.method NOT IN ('offset', 'credit_balance')
        AND coalesce(p.paid_at, p.created_at) <= ${end}::timestamptz
    `),
    q(sql`
      SELECT e.id, e.description, e.amount_kurus, e.expense_date, e.paid_at, e.bank_account_id, e.category_id,
             e.staff_id, e.staff_kind, e.vendor_name, s.full_name AS staff_name
      FROM expenses e LEFT JOIN staff s ON s.id = e.staff_id
      WHERE e.deleted_at IS NULL AND e.status <> 'rejected'
        AND (e.status IN ('approved', 'paid') OR e.paid_at IS NOT NULL)
        AND least(e.expense_date, coalesce(e.paid_at, e.expense_date)) <= ${end}::timestamptz
    `),
    q(sql`
      SELECT l.id, l.kind, l.entry_date, l.amount_kurus, l.description, l.period, s.full_name AS staff_name
      FROM staff_ledger_entries l JOIN staff s ON s.id = l.staff_id
      WHERE l.voided_at IS NULL AND l.entry_date <= ${end}::timestamptz
    `),
    q(sql`
      SELECT o.account, o.bank_account_id, o.vendor_id, o.amount_kurus, o.as_of_date, v.name AS vendor_name
      FROM opening_entries o LEFT JOIN vendors v ON v.id = o.vendor_id
      WHERE o.as_of_date <= ${end}::timestamptz
    `),
    q(sql`
      SELECT m.id, m.kind, m.movement_date, m.amount_kurus, m.from_account, m.from_bank_account_id,
             m.to_account, m.to_bank_account_id, m.income_category, m.payer_name, m.description,
             ig.account_code AS group_code, ig.name AS group_name
      FROM cash_movements m
      LEFT JOIN income_groups ig ON ig.id = m.income_group_id
      WHERE m.voided_at IS NULL AND m.movement_date <= ${end}::timestamptz
    `),
  ]);

  const accounts = new Map(Object.entries(BASE_ACCOUNTS));
  const bankCode = new Map<string, string>();
  banks.forEach((b, i) => {
    const code = `102.${String(i + 1).padStart(2, "0")}`;
    bankCode.set(String(b.id), code);
    accounts.set(code, [b.bank_name, b.account_name].filter(Boolean).join(" · ") || "Banka hesabı");
  });
  const categoryCode = new Map<string, string>();
  categories.forEach((c, i) => {
    // 770.99 personel için ayrılmış; 98'den sonrası üç haneye geçiyor.
    const num = i + 1;
    const code = num < 99 ? `770.${String(num).padStart(2, "0")}` : `770.${num + 1}`;
    categoryCode.set(String(c.id), code);
    accounts.set(code, String(c.name));
  });
  accounts.set(UNCATEGORIZED_CODE, "Kategorisiz giderler");
  accounts.set(STAFF_EXPENSE_CODE, "Personel giderleri");
  accounts.set(UNASSIGNED_BANK_CODE, "Hesabı belirtilmemiş");

  const cashAccount = (bankAccountId: unknown, method?: unknown): string =>
    bankAccountId
      ? (bankCode.get(String(bankAccountId)) ?? UNASSIGNED_BANK_CODE)
      : method === undefined || method === "cash"
        ? "100"
        : UNASSIGNED_BANK_CODE;

  const entries: JournalEntry[] = [];
  const pair = (debit: string, credit: string, amount: number): JournalLine[] => [
    { code: debit, debit: amount, credit: 0 },
    { code: credit, debit: 0, credit: amount },
  ];

  // Açılış fişi — tek fiş, fark 549'a.
  if (openingRows.length > 0) {
    const asOf = openingRows.map((r) => d(r.as_of_date)).sort((a, b) => a.getTime() - b.getTime())[0]!;
    const lines: JournalLine[] = [];
    for (const r of openingRows) {
      const amount = n(r.amount_kurus);
      if (amount === 0) continue;
      if (r.account === "cash") lines.push({ code: "100", debit: amount, credit: 0 });
      else if (r.account === "bank") lines.push({ code: cashAccount(r.bank_account_id), debit: amount, credit: 0 });
      else if (r.account === "vendor") lines.push({ code: "320", debit: 0, credit: amount });
    }
    const diff = lines.reduce((s, l) => s + l.debit - l.credit, 0);
    if (diff !== 0) lines.push({ code: "549", debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0 });
    if (lines.length > 0)
      entries.push({ date: asOf, order: 0, source: "opening", sourceId: null, description: "Açılış fişi", lines });
  }

  const unitLabel = (r: Row) => (r.unit_number ? ` · daire ${r.unit_number}` : "");

  for (const r of debtRows) {
    const amount = n(r.amount_kurus);
    if (r.opening) {
      if (amount > 0)
        entries.push({
          date: d(r.due_date), order: 1, source: "debt", sourceId: String(r.id),
          description: `Devir borcu${unitLabel(r)} — ${r.description}`, lines: pair("120", "549", amount),
        });
    } else if (amount > 0) {
      // Borç türünün muhasebe kodu varsa o; yoksa sınıfın varsayılanı.
      const income = r.account_code
        ? String(r.account_code)
        : r.kind === "dues" ? "600" : r.kind === "late_fee" ? "649" : "602";
      if (r.account_code && !accounts.has(income)) accounts.set(income, String(r.type_name ?? income));
      entries.push({
        date: d(r.created_at), order: 2, source: "debt", sourceId: String(r.id),
        description: `${r.description}${unitLabel(r)}`, lines: pair("120", income, amount),
      });
    }
    if (r.status === "written_off") {
      const open = amount - n(r.paid_kurus);
      if (open > 0)
        entries.push({
          date: d(r.updated_at), order: 5, source: "writeoff", sourceId: String(r.id),
          description: `Silinen alacak${unitLabel(r)} — ${r.description}`, lines: pair("659", "120", open),
        });
    }
  }

  for (const r of paymentRows) {
    const amount = n(r.amount);
    if (amount <= 0) continue;
    entries.push({
      date: d(r.at), order: 3, source: "payment", sourceId: String(r.id),
      description: `Tahsilat${unitLabel(r)}`, lines: pair(cashAccount(r.bank_account_id, r.method), "120", amount),
    });
  }

  for (const r of expenseRows) {
    const amount = n(r.amount_kurus);
    if (amount <= 0) continue;
    const cash = cashAccount(r.bank_account_id);
    if (r.staff_id && (r.staff_kind === "salary" || r.staff_kind === "advance")) {
      // Personel ödemesi: tahakkuk personel defterinden geliyor; burada
      // yalnız paranın çıkışı (ödenmemişse cari henüz etkilenmez).
      if (r.paid_at)
        entries.push({
          date: d(r.paid_at), order: 4, source: "expense_payment", sourceId: String(r.id),
          description: `${r.staff_kind === "advance" ? "Avans" : "Maaş ödemesi"} — ${r.staff_name ?? ""}`.trim(),
          lines: pair(r.staff_kind === "advance" ? "196" : "335", cash, amount),
        });
      continue;
    }
    const expenseCode = r.category_id ? (categoryCode.get(String(r.category_id)) ?? UNCATEGORIZED_CODE) : UNCATEGORIZED_CODE;
    const who = r.vendor_name ? ` (${r.vendor_name})` : "";
    entries.push({
      date: d(r.expense_date), order: 2, source: "expense", sourceId: String(r.id),
      description: `${r.description}${who}`, lines: pair(expenseCode, "320", amount),
    });
    if (r.paid_at)
      entries.push({
        date: d(r.paid_at), order: 4, source: "expense_payment", sourceId: String(r.id),
        description: `Ödeme: ${r.description}${who}`, lines: pair("320", cash, amount),
      });
  }

  for (const r of staffRows) {
    const amount = n(r.amount_kurus);
    if (amount <= 0) continue;
    const who = String(r.staff_name ?? "");
    const map: Record<string, [string, string, string]> = {
      accrual: [STAFF_EXPENSE_CODE, "335", `Maaş tahakkuku${r.period ? ` ${r.period}` : ""} — ${who}`],
      advance_deduction: ["335", "196", `Avanstan mahsup — ${who}`],
      opening_payable: ["549", "335", `Personel devir borcu — ${who}`],
      opening_advance: ["196", "549", `Personel devir avansı — ${who}`],
    };
    const m = map[String(r.kind)];
    if (!m) continue;
    entries.push({
      date: d(r.entry_date), order: r.kind === "opening_payable" || r.kind === "opening_advance" ? 1 : 2,
      source: "staff", sourceId: String(r.id), description: m[2], lines: pair(m[0], m[1], amount),
    });
  }

  for (const [code, name] of Object.values(INCOME_ACCOUNTS)) if (!accounts.has(code)) accounts.set(code, name);
  const sideCode = (account: unknown, bankAccountId: unknown) =>
    account === "bank" ? cashAccount(bankAccountId) : "100";
  for (const r of movementRows) {
    const amount = n(r.amount_kurus);
    if (amount <= 0) continue;
    const to = sideCode(r.to_account, r.to_bank_account_id);
    const note = r.description ? ` — ${r.description}` : "";
    if (r.kind === "transfer") {
      entries.push({
        date: d(r.movement_date), order: 3, source: "transfer", sourceId: String(r.id),
        description: `Virman${note}`, lines: pair(to, sideCode(r.from_account, r.from_bank_account_id), amount),
      });
    } else if (r.kind === "income") {
      // Kullanıcı tanımlı grup kendi koduna; yoksa sabit grubun alt hesabı.
      const incomeCode = r.group_code
        ? String(r.group_code)
        : (INCOME_ACCOUNTS[String(r.income_category)] ?? INCOME_ACCOUNTS.other!)[0];
      if (r.group_code && !accounts.has(incomeCode)) accounts.set(incomeCode, String(r.group_name));
      entries.push({
        date: d(r.movement_date), order: 3, source: "income", sourceId: String(r.id),
        description: `Harici tahsilat: ${r.payer_name ?? ""}${note}`.trim(), lines: pair(to, incomeCode, amount),
      });
    }
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order);
  return { entries: entries.filter((e) => e.date.getTime() <= until.getTime()), accounts, bankCodes: bankCode };
}

/** Alt hesabın üst hesabı (102.03 → 102). */
export function parentOf(code: string): string | null {
  const dot = code.indexOf(".");
  return dot > 0 ? code.slice(0, dot) : null;
}
