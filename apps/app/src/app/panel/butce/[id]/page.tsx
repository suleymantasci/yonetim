import { CheckCircle2, Copy, Pencil, Receipt, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { budgetDetail } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Input,
  Stat,
  Textarea,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import { FormField } from "@/components/form/action-form";
import Link from "@/components/link";
import { PrintButton } from "@/components/print-button";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import {
  approveBudget,
  createDuesPlanFromBudget,
  deleteBudget,
} from "../actions";

export const dynamic = "force-dynamic";

/**
 * İşletme projesi detayı — genel kurula sunulan belge ve gerçekleşen takibi.
 * Yazdırıldığında proje + daire başı avans cetveli olarak kullanılıyor.
 */
export default async function BudgetDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("report:read");
  const t = await getTranslations("app.budget");
  const f = await formatters();
  const data = await apiGet(`/v1/panel/budgets/${id}`, budgetDetail).catch(
    () => null,
  );
  if (!data) notFound();
  const { budget: b } = data;
  const canWrite = hasPermission(ctx.roles, "dues:write");
  const draft = b.status === "draft";
  const expected = data.lines.reduce((s, l) => s + l.expectedToDateMinor, 0);
  const pct = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

  const buttonClass =
    "inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover print:hidden";

  const actions = (
    <div className="flex flex-wrap gap-2">
      {canWrite && draft ? (
        <>
          <Link href={`/panel/butce/${b.id}/duzenle`} className={buttonClass}>
            <Pencil aria-hidden className="h-4 w-4" />
            {t("edit")}
          </Link>
          <ActionDrawerButton
            action={approveBudget}
            hidden={{ id: b.id }}
            icon={<CheckCircle2 />}
            tone="primary"
            label={t("approve")}
            title={t("approveTitle")}
            description={t("approveHint")}
            warning={t("approveWarning")}
            submitLabel={t("approve")}
          >
            <FormField
              name="note"
              label={t("approvalNote")}
              hint={t("approvalNoteHint")}
              required
            >
              <Textarea
                name="note"
                rows={2}
                minLength={3}
                maxLength={500}
                required
              />
            </FormField>
          </ActionDrawerButton>
        </>
      ) : null}
      {canWrite && !draft && !b.duesPlanId ? (
        <ActionDrawerButton
          action={createDuesPlanFromBudget}
          hidden={{ id: b.id }}
          icon={<Receipt />}
          tone="primary"
          label={t("toDuesPlan")}
          title={t("toDuesPlan")}
          description={t("toDuesPlanHint", { amount: f.money(b.monthlyMinor) })}
          warning={
            data.overlappingDuesPlans > 0
              ? t("overlapWarning", { count: data.overlappingDuesPlans })
              : undefined
          }
          submitLabel={t("toDuesPlan")}
        >
          <FormField name="dueDayOfMonth" label={t("dueDay")} required>
            <Input
              name="dueDayOfMonth"
              type="number"
              min={1}
              max={28}
              defaultValue={10}
              required
            />
          </FormField>
        </ActionDrawerButton>
      ) : null}
      {canWrite ? (
        <Link href={`/panel/butce/yeni?copy=${b.id}`} className={buttonClass}>
          <Copy aria-hidden className="h-4 w-4" />
          {t("copy")}
        </Link>
      ) : null}
      <PrintButton label={t("print")} />
    </div>
  );

  return (
    <>
      <PageHeader
        title={b.name}
        description={`${f.period(b.startPeriod)} – ${f.period(b.endPeriod)} · ${t("monthsCount", { months: b.months })} · ${t(`formulaOption.${b.formula}` as "formulaOption.land_share")}`}
        action={actions}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={draft ? "neutral" : "success"}>
          {t(`statusOption.${b.status}`)}
        </Badge>
        {b.approvedAt ? (
          <span className="text-sm text-fg-muted">
            {t("approvedOn", {
              date: f.date(b.approvedAt),
              note: b.approvalNote ?? "",
            })}
          </span>
        ) : null}
        {b.duesPlanId ? (
          <Link
            href="/panel/aidat"
            className="text-sm font-medium text-primary underline-offset-2 hover:underline print:hidden"
          >
            {t("duesPlanLinked")}
          </Link>
        ) : null}
      </div>

      {data.overlappingDuesPlans > 0 && !b.duesPlanId ? (
        <div className="mb-4 print:hidden">
          <Alert tone="warning">
            {t("overlapWarning", { count: data.overlappingDuesPlans })}
          </Alert>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label={t("grandTotal")}
          value={f.money(b.totalMinor)}
          hint={t("reserveHintStat", {
            pct: b.reservePct,
            amount: f.money(data.reserveMinor),
          })}
        />
        <Stat label={t("monthlyShort")} value={f.money(b.monthlyMinor)} />
        <Stat
          label={t("expectedToDate", { months: data.elapsedMonths })}
          value={f.money(expected)}
        />
        <Stat
          label={t("actual")}
          value={f.money(b.actualMinor)}
          tone={
            b.actualMinor > expected * 1.1 && expected > 0
              ? "danger"
              : b.actualMinor > expected
                ? "warning"
                : "success"
          }
          hint={
            expected > 0
              ? t("actualVsExpected", {
                  pct: f.percent(pct(b.actualMinor, expected)),
                })
              : undefined
          }
        />
      </div>

      <Card className="mb-4">
        <CardHeader title={t("linesTitle")} description={t("linesHint")} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>
                    {t("lineLabel")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("linePlanned")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("monthlyShort")}
                  </th>
                  <th
                    scope="col"
                    className={`${tc.th} text-right print:hidden`}
                  >
                    {t("expectedShort")}
                  </th>
                  <th
                    scope="col"
                    className={`${tc.th} text-right print:hidden`}
                  >
                    {t("actual")}
                  </th>
                  <th
                    scope="col"
                    className={`${tc.th} text-right print:hidden`}
                  >
                    {t("usage")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => {
                  const usage =
                    l.actualMinor === null
                      ? null
                      : pct(l.actualMinor, l.plannedMinor);
                  return (
                    <tr key={l.id} className={tc.tr}>
                      <td className={tc.td}>
                        <div className="text-fg">{l.label}</div>
                        <div className="text-xs text-fg-subtle print:hidden">
                          {l.sourceName ?? t("sourceNone")}
                        </div>
                      </td>
                      <td className={tc.tdNum}>{f.money(l.plannedMinor)}</td>
                      <td className={tc.tdNum}>
                        {f.money(Math.round(l.plannedMinor / b.months))}
                      </td>
                      <td className={`${tc.tdNum} print:hidden`}>
                        {f.money(l.expectedToDateMinor)}
                      </td>
                      <td className={`${tc.tdNum} print:hidden`}>
                        {l.actualMinor === null ? "—" : f.money(l.actualMinor)}
                      </td>
                      <td className={`${tc.tdNum} print:hidden`}>
                        {usage === null ? (
                          "—"
                        ) : (
                          <span
                            className={
                              usage > 1
                                ? "font-semibold text-danger-fg"
                                : usage > 0.9
                                  ? "text-warning-fg"
                                  : ""
                            }
                          >
                            {f.percent(usage)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className={tc.tr}>
                  <td className={tc.tdMuted}>
                    {t("reserveRow", { pct: b.reservePct })}
                  </td>
                  <td className={tc.tdNum}>{f.money(data.reserveMinor)}</td>
                  <td className={tc.tdNum}>
                    {f.money(Math.round(data.reserveMinor / b.months))}
                  </td>
                  <td className="print:hidden" colSpan={3} />
                </tr>
                {data.unplannedActualMinor > 0 ? (
                  <tr className={`${tc.tr} print:hidden`}>
                    <td className={tc.tdMuted}>{t("unplannedRow")}</td>
                    <td className={tc.tdNum}>—</td>
                    <td className={tc.tdNum}>—</td>
                    <td className={tc.tdNum}>—</td>
                    <td className={tc.tdNum}>
                      {f.money(data.unplannedActualMinor)}
                    </td>
                    <td className={tc.tdNum}>—</td>
                  </tr>
                ) : null}
                <tr className="font-semibold">
                  <td className={tc.td}>{t("grandTotal")}</td>
                  <td className={tc.tdNum}>{f.money(b.totalMinor)}</td>
                  <td className={tc.tdNum}>{f.money(b.monthlyMinor)}</td>
                  <td className={`${tc.tdNum} print:hidden`}>
                    {f.money(expected)}
                  </td>
                  <td className={`${tc.tdNum} print:hidden`}>
                    {f.money(b.actualMinor)}
                  </td>
                  <td className={`${tc.tdNum} print:hidden`}>
                    {expected > 0
                      ? f.percent(pct(b.actualMinor, b.totalMinor))
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader title={t("sharesTitle")} description={t("sharesHint")} />
        <CardBody className="p-0">
          {data.fellBackToEqual ? (
            <div className="p-4 print:hidden">
              <Alert tone="warning">{t("fellBackToEqual")}</Alert>
            </div>
          ) : null}
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>
                    {t("unit")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("weight")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("monthlyShort")}
                  </th>
                  <th scope="col" className={`${tc.th} text-right`}>
                    {t("periodTotal")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.shares.map((s) => (
                  <tr key={s.unitId} className={tc.tr}>
                    <td className={tc.td}>
                      {s.label}
                      {s.exempt ? (
                        <Badge tone="neutral" className="ml-2">
                          {t("exempt")}
                        </Badge>
                      ) : null}
                    </td>
                    <td className={tc.tdNum}>
                      {s.weight
                        ? s.weight.toLocaleString("tr-TR", {
                            maximumFractionDigits: 4,
                          })
                        : "—"}
                    </td>
                    <td className={tc.tdNum}>{f.money(s.monthlyMinor)}</td>
                    <td className={tc.tdNum}>{f.money(s.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {b.notes ? (
        <Card className="mb-4">
          <CardHeader title={t("notes")} />
          <CardBody>
            <p className="whitespace-pre-line text-sm text-fg-muted">
              {b.notes}
            </p>
          </CardBody>
        </Card>
      ) : null}

      {canWrite && draft ? (
        <div className="print:hidden">
          <ActionDrawerButton
            action={deleteBudget}
            hidden={{ id: b.id }}
            icon={<Trash2 />}
            tone="danger"
            label={t("delete")}
            title={t("deleteTitle")}
            warning={t("deleteWarning")}
            submitLabel={t("delete")}
          />
        </div>
      ) : null}
    </>
  );
}
