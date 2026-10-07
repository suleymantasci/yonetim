import { getTranslations } from "next-intl/server";

import { journalResponse } from "@yonetim/contracts";
import { Alert, Card, CardBody, CardHeader, Input } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { AccountingSubnav } from "../subnav";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Yevmiye defteri — mizanla aynı fiş listesi, tarih sırasıyla numaralı.
 * Tablo değil fiş blokları: telefonda okunuyor, yazdırınca defter görünümü.
 */
export default async function JournalPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.accounting");
  const f = await formatters();
  const params = await searchParams;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = params.from && DATE.test(params.from) ? params.from : monthStart;
  const to = params.to && DATE.test(params.to) ? params.to : today;

  const journal = await apiGet(`/v1/panel/reports/accounting/journal?${toQuery({ from, to })}`, journalResponse);

  return (
    <>
      <PageHeader title={t("journalTitle")} description={t("journalDescription")} action={<PrintButton label={t("print")} />} />
      <AccountingSubnav active="journal" />

      <Card>
        <CardHeader
          title={t("mizanRange", { from: f.date(new Date(`${from}T12:00:00`)), to: f.date(new Date(`${to}T12:00:00`)) })}
          description={t("journalCount", { count: journal.total })}
          action={
            <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
              <label className="text-xs text-fg-subtle">
                {t("from")}
                <Input name="from" type="date" defaultValue={from} className="mt-0.5 h-9" />
              </label>
              <label className="text-xs text-fg-subtle">
                {t("to")}
                <Input name="to" type="date" defaultValue={to} className="mt-0.5 h-9" />
              </label>
              <button type="submit" className="h-9 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
                {t("apply")}
              </button>
            </form>
          }
        />
        <CardBody className="space-y-3">
          {journal.total > journal.limit ? (
            <Alert tone="warning">{t("journalTruncated", { shown: journal.limit, total: journal.total })}</Alert>
          ) : null}
          {journal.entries.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("journalEmpty")}</p>
          ) : (
            journal.entries.map((e) => (
              <article key={e.no} className="break-inside-avoid rounded-lg border border-border">
                <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-border bg-surface-sunken px-3 py-2 text-sm">
                  <span className="font-medium text-fg [overflow-wrap:anywhere]">
                    <span className="mr-2 tabular-nums text-fg-subtle">#{e.no}</span>
                    {e.description}
                  </span>
                  <span className="tabular-nums text-xs text-fg-muted">{f.date(new Date(`${e.date}T12:00:00`))}</span>
                </header>
                <div className="divide-y divide-border">
                  {e.lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-1.5 text-sm sm:grid-cols-[1fr_auto_auto]">
                      <span className={`min-w-0 [overflow-wrap:anywhere] ${l.creditMinor ? "pl-4" : ""}`}>
                        <span className="mr-1.5 tabular-nums text-fg-subtle">{l.code}</span>
                        {l.name}
                      </span>
                      {/* Telefonda tek sütun (B/A ekiyle); geniş ekranda iki sütun. */}
                      <span className="text-right tabular-nums sm:hidden">
                        {f.money(l.debitMinor || l.creditMinor)} {l.debitMinor ? t("debitShort") : t("creditShort")}
                      </span>
                      <span className="hidden w-28 text-right tabular-nums sm:block">{l.debitMinor ? f.money(l.debitMinor) : ""}</span>
                      <span className="hidden w-28 text-right tabular-nums sm:block">{l.creditMinor ? f.money(l.creditMinor) : ""}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t-2 border-border-strong px-3 pt-2 text-sm font-semibold">
            <span>{t("total")}</span>
            <span className="tabular-nums">
              {f.money(journal.totals.debitMinor)} {t("debitShort")} · {f.money(journal.totals.creditMinor)} {t("creditShort")}
            </span>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
