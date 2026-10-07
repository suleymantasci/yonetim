import { describe, expect, it } from "vitest";

import type { Journal, JournalEntry } from "../apps/api/src/finance/accounting/journal";
import {
  balanceSheet,
  balancesAt,
  incomeStatement,
  ledger,
  monthOf,
  monthsInRange,
  operatingBook,
} from "../apps/api/src/finance/accounting/statements";

/**
 * Mali tabloların iç tutarlılığı: hepsi aynı fiş listesinden türüyor, bu
 * yüzden bilanço denk, işletme defterinin kalanı kasa+banka bakiyesi, gelir-
 * gider neti bilançodaki dönem sonucu olmalı.
 */
const at = (day: string) => new Date(`${day}T12:00:00+03:00`);
const pair = (debit: string, credit: string, amount: number) => [
  { code: debit, debit: amount, credit: 0 },
  { code: credit, debit: 0, credit: amount },
];
let seq = 0;
const entry = (day: string, source: JournalEntry["source"], description: string, lines: JournalEntry["lines"]): JournalEntry => ({
  date: at(day),
  order: 2,
  source,
  sourceId: String(++seq),
  description,
  lines,
});

const journal: Journal = {
  accounts: new Map([
    ["100", "Kasa"],
    ["102", "Bankalar"],
    ["102.01", "Ziraat · Aidat"],
    ["120", "Alıcılar"],
    ["320", "Satıcılar"],
    ["549", "Özel fonlar"],
    ["600", "Aidat gelirleri"],
    ["602.01", "Kira gelirleri"],
    ["659", "Silinen alacaklar"],
    ["770", "Genel yönetim giderleri"],
    ["770.01", "Elektrik"],
  ]),
  bankCodes: new Map([["b1", "102.01"]]),
  entries: [
    { ...entry("2025-12-31", "opening", "Açılış fişi", [...pair("100", "549", 50_000)]), order: 0 },
    entry("2025-12-15", "debt", "Aralık aidatı", pair("120", "600", 100_000)),
    entry("2026-01-05", "debt", "Ocak aidatı", pair("120", "600", 120_000)),
    entry("2026-01-10", "payment", "Tahsilat", pair("102.01", "120", 90_000)),
    entry("2026-01-12", "transfer", "Virman", pair("100", "102.01", 20_000)),
    entry("2026-01-20", "expense", "Elektrik faturası", pair("770.01", "320", 30_000)),
    entry("2026-02-01", "expense_payment", "Ödeme: Elektrik", pair("320", "100", 30_000)),
    entry("2026-02-03", "income", "Harici tahsilat: baz istasyonu", pair("102.01", "602.01", 40_000)),
    entry("2026-02-10", "writeoff", "Silinen alacak", pair("659", "120", 5_000)),
  ].sort((a, b) => a.date.getTime() - b.date.getTime()),
};

const start = new Date("2026-01-01T00:00:00+03:00");
const end = new Date("2026-02-28T23:59:59.999+03:00");

describe("ay yardımcıları", () => {
  it("İstanbul ayı: UTC gece yarısından önceki 1 Şubat 01:00 → 2026-02", () => {
    expect(monthOf(new Date("2026-01-31T22:30:00Z"))).toBe("2026-02");
  });
  it("aralık ayları, yıl dönümü dahil", () => {
    expect(monthsInRange("2025-11-15", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsInRange("2024-01-01", "2026-12-31", 24)).toHaveLength(24);
  });
});

describe("gelir-gider tablosu", () => {
  const months = monthsInRange("2026-01-01", "2026-02-28");
  const result = incomeStatement(journal, start, end, months);

  it("dönem dışı (Aralık) gelir girmiyor; aylık sütunlar doğru", () => {
    const dues = result.income.find((r) => r.code === "600")!;
    expect(dues.byMonth).toEqual([120_000, 0]);
    expect(result.income.find((r) => r.code === "602.01")!.byMonth).toEqual([0, 40_000]);
  });

  it("659 silinen alacak gider tarafında; net = gelir − gider", () => {
    expect(result.expense.map((r) => r.code)).toEqual(["659", "770.01"]);
    expect(result.totals.incomeMinor).toBe(160_000);
    expect(result.totals.expenseMinor).toBe(35_000);
    expect(result.totals.netMinor).toBe(125_000);
    expect(result.totals.netByMonth).toEqual([90_000, 35_000]);
  });
});

describe("bilanço", () => {
  const sheet = balanceSheet(journal, end, start);

  it("aktif = pasif + özkaynak", () => {
    expect(sheet.totals.assetsMinor).toBe(sheet.totals.liabilitiesMinor + sheet.totals.equityMinor);
  });

  it("dönem sonucu gelir-gider neti; geçmiş yıl sonucu ayrı satır", () => {
    expect(sheet.totals.periodResultMinor).toBe(125_000);
    expect(sheet.equity.find((l) => l.code === "570")!.amountMinor).toBe(100_000);
  });

  it("banka alt hesabı üst hesabın altında, toplamda bir kez", () => {
    const bank = sheet.assets.filter((l) => l.code.startsWith("102"));
    expect(bank.map((l) => [l.code, l.amountMinor, l.sub])).toEqual([
      ["102", 110_000, false],
      ["102.01", 110_000, true],
    ]);
    // Kasa 50.000 + 20.000 virman − 30.000 ödeme; alacak 220.000 − 90.000 − 5.000.
    expect(sheet.assets.find((l) => l.code === "100")!.amountMinor).toBe(40_000);
    expect(sheet.assets.find((l) => l.code === "120")!.amountMinor).toBe(125_000);
    expect(sheet.totals.assetsMinor).toBe(275_000);
  });
});

describe("işletme defteri", () => {
  const book = operatingBook(journal, start, end);
  const cash = balancesAt(journal, end);

  it("devir açılış fişinden; virman deftere girmiyor", () => {
    expect(book.openingMinor).toBe(50_000);
    expect(book.lines.map((l) => l.description)).toEqual([
      "Tahsilat",
      "Ödeme: Elektrik",
      "Harici tahsilat: baz istasyonu",
    ]);
    expect(book.lines[0]!.head).toBe("Aidat ve borç tahsilatı");
    expect(book.lines[1]!.head).toBe("Gider ödemesi");
  });

  it("kalan = kasa + bankalar bakiyesi", () => {
    expect(book.closingMinor).toBe((cash.get("100") ?? 0) + (cash.get("102.01") ?? 0));
    expect(book.lines.at(-1)!.balanceMinor).toBe(book.closingMinor);
  });
});

describe("kebir", () => {
  it("üst hesap alt hesapları kapsıyor; devir dönem öncesinden", () => {
    const k = ledger(journal, "102", start, end);
    expect(k.openingMinor).toBe(0);
    expect(k.lines.map((l) => [l.debitMinor, l.creditMinor, l.balanceMinor])).toEqual([
      [90_000, 0, 90_000],
      [0, 20_000, 70_000],
      [40_000, 0, 110_000],
    ]);
    expect(k.closingMinor).toBe(110_000);
    expect(k.lines[1]!.counter).toBe("100 Kasa");
  });

  it("120 devri Aralık tahakkuku", () => {
    const k = ledger(journal, "120", start, end);
    expect(k.openingMinor).toBe(100_000);
    expect(k.closingMinor).toBe(125_000);
  });
});
