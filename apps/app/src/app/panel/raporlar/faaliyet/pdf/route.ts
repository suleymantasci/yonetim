import { getTranslations } from "next-intl/server";

import { activitySummaryResponse } from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import type { Block } from "@/lib/pdf/report-pdf";
import { kv } from "../../pdf-blocks";
import { pdfRoute } from "../../pdf-route";
import { parseRange } from "../../report-tools";

export const dynamic = "force-dynamic";

/** Yönetim faaliyet raporu PDF'i — değerlendirme metni ekrandan (POST). */
export const { GET, POST } = pdfRoute(
  async ({ params, notes, ctx, f, day }) => {
    const t = await getTranslations("app.reportsHub");
    const { from, to } = parseRange(params);
    const a = await apiGet(
      `/v1/panel/reports/accounting/activity?${toQuery({ from, to })}`,
      activitySummaryResponse,
    );
    const rate =
      a.finance.chargedMinor > 0
        ? a.finance.collectedMinor / a.finance.chargedMinor
        : 0;
    const net =
      a.finance.chargedMinor +
      a.finance.otherIncomeMinor -
      a.finance.expenseMinor;

    const blocks: Block[] = [
      {
        type: "docTitle",
        title: ctx.tenantName,
        subtitle: t("activityDocTitle", { from: day(from), to: day(to) }),
      },
      { type: "heading", text: `1. ${t("secFinance")}` },
      kv([
        [t("charged"), f.money(a.finance.chargedMinor)],
        [t("collected"), f.money(a.finance.collectedMinor)],
        [t("collectionRate"), f.percent(rate)],
        [t("otherIncome"), f.money(a.finance.otherIncomeMinor)],
        [t("totalExpense"), f.money(a.finance.expenseMinor)],
        [t("accrualNet"), f.money(net)],
        [t("receivables"), f.money(a.finance.receivablesMinor)],
        [
          t("overdueUnits"),
          `${a.finance.overdueUnits} / ${a.finance.unitCount}`,
        ],
      ]),
    ];
    if (a.topExpenses.length > 0) {
      blocks.push(
        { type: "heading", text: `2. ${t("secExpenses")}` },
        kv(a.topExpenses.map((e) => [e.name, f.money(e.amountMinor)])),
      );
    }
    if (a.budget) {
      blocks.push(
        {
          type: "heading",
          text: `3. ${t("secBudget", { name: a.budget.name })}`,
        },
        kv([
          [t("plannedToDate"), f.money(a.budget.plannedToDateMinor)],
          [t("actualToDate"), f.money(a.budget.actualToDateMinor)],
          [
            t("budgetUsage"),
            a.budget.plannedToDateMinor > 0
              ? f.percent(
                  a.budget.actualToDateMinor / a.budget.plannedToDateMinor,
                )
              : "—",
          ],
        ]),
      );
    }
    blocks.push(
      { type: "heading", text: `4. ${t("secOperations")}` },
      kv([
        [t("requestsOpened"), String(a.requests.opened)],
        [t("requestsResolved"), String(a.requests.resolved)],
        [t("requestsOpen"), String(a.requests.open)],
        [
          t("maintenanceDone"),
          `${a.maintenance.done} (${f.money(a.maintenance.costMinor)})`,
        ],
        [t("maintenanceOverdue"), String(a.maintenance.overdue)],
        [t("reservations"), String(a.reservations)],
        [t("announcements"), String(a.announcements)],
        [t("staffCount"), String(a.staffCount)],
      ]),
      { type: "heading", text: `5. ${t("secMeetings")}` },
      a.meetings.length === 0
        ? { type: "paragraph", text: t("noMeetings"), muted: true }
        : {
            type: "table",
            headless: true,
            columns: [
              { header: "", weight: 1 },
              { header: "", weight: 3, wrap: true },
              { header: "", weight: 1.3, align: "right" },
            ],
            rows: a.meetings.map((m) => ({
              cells: [
                f.date(m.date),
                m.title,
                t("decisionsCount", { count: m.decisions }),
              ],
            })),
          },
      { type: "heading", text: `6. ${t("secLegal")}` },
      kv([
        [t("legalOpened"), String(a.legal.opened)],
        [t("legalClosed"), String(a.legal.closed)],
        [t("legalOpen"), String(a.legal.open)],
      ]),
      { type: "heading", text: `7. ${t("secAssessment")}` },
      { type: "note", text: notes.assessment, lines: 6 },
      {
        type: "signatures",
        labels: [t("manager")],
        caption: t("nameSignature"),
      },
    );

    return {
      title: t("activityTitle"),
      period: t("rangeTitle", { from: day(from), to: day(to) }),
      filename: `faaliyet-raporu_${from}_${to}`,
      blocks,
    };
  },
);
