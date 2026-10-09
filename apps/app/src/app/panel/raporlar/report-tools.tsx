import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Input, Select } from "@yonetim/ui";

import Link from "@/components/link";
import { memberScopeOptions } from "@/lib/member-scope";
import { SubnavScroll } from "./subnav-scroll";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** İstanbul günü: `YYYY-MM-DD`. */
export function todayIstanbul(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

/** `?from=&to=` — geçersizse yıl başı → bugün. */
export function parseRange(params: Record<string, string | undefined>): {
  from: string;
  to: string;
} {
  const today = todayIstanbul();
  const from =
    params.from && DATE.test(params.from)
      ? params.from
      : `${today.slice(0, 4)}-01-01`;
  const to = params.to && DATE.test(params.to) ? params.to : today;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function parseDay(value: string | undefined): string {
  return value && DATE.test(value) ? value : todayIstanbul();
}

/** Tarih aralığı filtresi (GET formu): rapor bağlantısı paylaşılabilir kalsın. */
export async function RangeForm({
  from,
  to,
  hidden = {},
  children,
}: {
  from: string;
  to: string;
  hidden?: Record<string, string>;
  children?: ReactNode;
}) {
  const t = await getTranslations("app.reportsHub");
  return (
    <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="text-xs text-fg-subtle">
        {t("from")}
        <Input
          name="from"
          type="date"
          defaultValue={from}
          className="mt-0.5 h-9"
        />
      </label>
      <label className="text-xs text-fg-subtle">
        {t("to")}
        <Input name="to" type="date" defaultValue={to} className="mt-0.5 h-9" />
      </label>
      {children}
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
      >
        {t("apply")}
      </button>
    </form>
  );
}

export type ReportTab =
  | "summary"
  | "incomeStatement"
  | "balanceSheet"
  | "operatingBook"
  | "unitStatements"
  | "debtMatrix"
  | "openItems"
  | "receipts"
  | "collections"
  | "expenseDetail"
  | "cashDays"
  | "monthly"
  | "debtRuns"
  | "accountCodes"
  | "memberNotes"
  | "messages"
  | "deleted"
  | "activity"
  | "auditReport";

/** Raporlar arası gezinme. */
export async function ReportsSubnav({ active }: { active: ReportTab }) {
  const t = await getTranslations("app.reportsHub");
  const items: { key: ReportTab; href: string }[] = [
    { key: "summary", href: "/panel/raporlar" },
    { key: "incomeStatement", href: "/panel/raporlar/gelir-gider" },
    { key: "balanceSheet", href: "/panel/raporlar/bilanco" },
    { key: "operatingBook", href: "/panel/raporlar/isletme-defteri" },
    { key: "unitStatements", href: "/panel/raporlar/hesap-ozeti" },
    { key: "debtMatrix", href: "/panel/raporlar/donem-borc" },
    { key: "openItems", href: "/panel/raporlar/borc-dokumu" },
    { key: "receipts", href: "/panel/raporlar/makbuzlar" },
    { key: "collections", href: "/panel/raporlar/tahsilat" },
    { key: "expenseDetail", href: "/panel/raporlar/gider" },
    { key: "cashDays", href: "/panel/raporlar/kasa-gunluk" },
    { key: "monthly", href: "/panel/raporlar/aylik" },
    { key: "debtRuns", href: "/panel/raporlar/borclandirma" },
    { key: "messages", href: "/panel/raporlar/gonderimler" },
    { key: "deleted", href: "/panel/raporlar/silinenler" },
    { key: "activity", href: "/panel/raporlar/faaliyet" },
    { key: "auditReport", href: "/panel/raporlar/denetim-raporu" },
    { key: "memberNotes", href: "/panel/raporlar/uye-notlari" },
    { key: "accountCodes", href: "/panel/raporlar/muhasebe-kodlari" },
  ];
  return (
    <nav
      id="reports-subnav"
      aria-label={t("navLabel")}
      className="relative mb-4 flex gap-1 overflow-x-auto border-b border-border print:hidden"
    >
      <SubnavScroll id="reports-subnav" />
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.key === active ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
            item.key === active
              ? "border-primary text-fg"
              : "border-transparent text-fg-subtle hover:text-fg"
          }`}
        >
          {t(`tab.${item.key}`)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Üye kapsamı seçicisi (`?uye=`) — `RangeForm` içine konur. Tüm kişi bazlı
 * raporlarda aynı seçenekler (Yönetimcell'deki "Tümü / Aktif malik ve
 * kiracılar / … / Eski kiracılar").
 */
export async function MemberScopeSelect({ value }: { value: string | undefined }) {
  const tMember = await getTranslations("app.memberScope");
  return (
    <label className="text-xs text-fg-subtle">
      {tMember("label")}
      <Select name="uye" defaultValue={value ?? ""} className="mt-0.5 h-9">
        {memberScopeOptions(tMember).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
