import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { DECISION_KINDS, decisionBookResponse } from "@yonetim/contracts";
import { Alert, Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ListControls } from "@/components/list/list-controls";
import { apiGet, toQuery } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import type { SearchParamsInput } from "@/lib/list-params";
import { DecisionBook, type DecisionEntryView } from "./decision-book";

export const dynamic = "force-dynamic";

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Karar Defteri — KMK md.32.
 *
 * Rakip incelemesinde (Dijiyon + Yönetimcell) her ikisinde de canlı
 * doğrulanan, sektörde neredeyse zorunlu modül. Mevcut `toplantilar` ekranı
 * bunun yerine geçmiyor: orada kararlar toplantı içinde numaralanıyor, defter
 * ise site genelinde **sürekli** numaralı ve toplantısız kararları da
 * kapsıyor (gerekçe `packages/db/.../compliance.ts`).
 *
 * SAKİN DE GÖREBİLİR: `decision:read` sakin rolünün temel izinleri arasında,
 * çünkü KMK md.32/son kat malikine kararları görme hakkı tanıyor. Yazma
 * (`decision:write`) yalnız yönetimde.
 */
export default async function DecisionBookPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  const ctx = await requirePermission("decision:read");
  const t = await getTranslations("app.decisionBook");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const query = await searchParams;
  const yearFilter = single(query.yil);
  const kindFilter = single(query.tur);

  const data = await apiGet(
    `/v1/panel/decision-book?${toQuery({
      year: yearFilter,
      kind: kindFilter,
    })}`,
    decisionBookResponse,
  );

  const entries: DecisionEntryView[] = data.rows.map((row) => ({
    id: row.id,
    entryNo: row.entryNo,
    decidedAt: fmt.date(row.decidedAt),
    kind: row.kind,
    kindLabel: tEnum(`decisionKind.${row.kind}`),
    meetingTitle: row.meetingTitle,
    subject: row.subject,
    body: row.body,
    quorumLabel: tEnum(`quorumRule.${row.quorumRule}`),
    // Oy değerleri sunucudan **metin** geliyor ve öyle gösteriliyor:
    // sayıya çevirmek arsa payı kesirlerinde yuvarlama kaybı demek.
    votesFor: row.votesFor,
    votesAgainst: row.votesAgainst,
    abstentions: row.abstentions,
    passed: row.passed,
    correctsEntryId: row.correctsEntryId,
    correctedByEntryNo: row.correctedByEntryNo,
    bookPageNo: row.bookPageNo,
    createdByName: row.createdByName,
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mb-4">
        <Alert tone="info">{t("legalNotice")}</Alert>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("statEntries")} value={String(data.totals.entries)} />
        <Stat label={t("statPassed")} value={String(data.totals.passed)} />
        <Stat label={t("statRejected")} value={String(data.totals.rejected)} />
        {/* Düzeltilmiş karar sayısı defterin sağlığı göstergesi: yüksekse
            kararlar yeterince özenli yazılmıyor demektir. */}
        <Stat
          label={t("statCorrected")}
          value={String(data.totals.corrected)}
          tone={data.totals.corrected > 0 ? "warning" : "neutral"}
          hint={t("statCorrectedHint")}
        />
      </div>

      <ListControls
        searchable={false}
        filters={[
          {
            param: "yil",
            label: t("year"),
            value: yearFilter ?? "",
            options: [
              { value: "", label: t("allYears") },
              ...data.years.map((year) => ({
                value: String(year),
                label: String(year),
              })),
            ],
          },
          {
            param: "tur",
            label: t("kind"),
            value: kindFilter ?? "",
            options: [
              { value: "", label: t("allKinds") },
              ...DECISION_KINDS.map((kind) => ({
                value: kind,
                label: tEnum(`decisionKind.${kind}`),
              })),
            ],
          },
        ]}
      />

      <DecisionBook
        entries={entries}
        meetings={data.meetings.map((meeting) => ({
          id: meeting.id,
          label: `${fmt.date(meeting.scheduledAt)} — ${meeting.title}`,
        }))}
        nextEntryNo={data.nextEntryNo}
        canWrite={can(ctx, "decision:write")}
      />

      <p className="mt-4 text-xs text-fg-subtle">
        {t.rich("meetingsLink", {
          link: (chunks) => (
            <Link href="/panel/toplantilar" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}
