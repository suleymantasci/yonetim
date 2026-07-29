import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import {
  blockListResponse,
  expenseDetail as expenseDetailSchema,
} from "@yonetim/contracts";
import { AppError, currentPeriod, periodKey } from "@yonetim/core";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { DistributePanel } from "./distribute-panel";

export const dynamic = "force-dynamic";

const DISTRIBUTIONS = [
  "equal",
  "land_share",
  "area",
  "person_count",
  "meter",
] as const;

export default async function ExpenseDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("expense:read");
  const t = await getTranslations("app.expenses");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const [detail, blockList] = await Promise.all([
    apiGet(`/v1/panel/expenses/${id}`, expenseDetailSchema).catch(
      (error: unknown) => {
        if (error instanceof AppError && error.code === "not_found") notFound();
        throw error;
      },
    ),
    apiGet("/v1/panel/units/blocks", blockListResponse),
  ]);
  const blocks = blockList.rows;
  if (!detail) notFound();

  const expense = detail.expense;
  const netKurus = expense.amountMinor - expense.vatMinor;
  const canApprove = hasPermission(ctx.roles, "expense:approve");
  const canWrite = hasPermission(ctx.roles, "expense:write");
  const distributed = expense.distributedAt !== null;
  const distributable =
    canApprove &&
    !distributed &&
    (expense.status === "approved" || expense.status === "paid");

  let statusTone: "neutral" | "success" | "warning" | "danger" = "neutral";
  if (expense.status === "paid" || expense.status === "approved")
    statusTone = "success";
  else if (expense.status === "pending_approval") statusTone = "warning";
  else if (expense.status === "rejected") statusTone = "danger";

  return (
    <>
      <PageHeader
        title={expense.description}
        description={
          detail.categoryName
            ? t("detailSubtitle", {
                category: detail.categoryName,
                date: fmt.date(expense.expenseDate),
              })
            : fmt.date(expense.expenseDate)
        }
        breadcrumb={[
          { label: t("title"), href: "/panel/giderler" },
          { label: expense.description },
        ]}
        meta={
          <>
            <Badge tone={statusTone}>
              {tEnum(`expenseStatus.${expense.status}`)}
            </Badge>
            {distributed ? (
              <Badge tone="success">{t("distributedBadge")}</Badge>
            ) : (
              <Badge tone="warning">{t("notDistributedBadge")}</Badge>
            )}
          </>
        }
        action={
          <>
            {expense.attachmentUrl ? (
              <a
                href={expense.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
              >
                <ExternalLink aria-hidden className="h-4 w-4" />
                {t("viewInvoice")}
              </a>
            ) : null}
            {canWrite && !distributed ? (
              <Link
                href={`/panel/giderler/${id}/duzenle`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
              >
                <Pencil aria-hidden className="h-4 w-4" />
                {tCommon("action.edit")}
              </Link>
            ) : null}
            {distributable ? (
              <DistributePanel
                expenseId={id}
                categoryDistribution={detail.categoryDistribution}
                amountKurus={expense.amountMinor}
                vatKurus={expense.vatMinor}
                blocks={blocks.map((block) => ({
                  id: block.id,
                  name: block.name,
                }))}
                defaultPeriod={expense.period ?? periodKey(currentPeriod())}
                labels={{
                  action: t("distributeAction"),
                  title: t("distributeTitle"),
                  hint: t("distributeHint"),
                  formula: t("distribution"),
                  formulaHint: t("distributionHint"),
                  formulaOptions: DISTRIBUTIONS.map((value) => ({
                    value,
                    label: tEnum(`duesFormula.${value}`),
                    description: tEnum(`duesFormulaDescription.${value}`),
                  })),
                  period: t("period"),
                  periodHint: t("distributePeriodHint"),
                  dueDay: t("dueDay"),
                  dueDayHint: t("dueDayHint"),
                  scope: t("distributeScope"),
                  scopeHint: t("distributeScopeHint"),
                  excludeVat: t("excludeVat"),
                  excludeVatHint: t("excludeVatHint"),
                  preview: t("previewAction"),
                  previewRequired: t("previewRequired"),
                  previewEmpty: t("previewEmpty"),
                  previewTotal: t("distributePool"),
                  previewUnits: t("previewUnits"),
                  unit: t("unit"),
                  amount: t("amountGross"),
                  exempt: t("exemptShort"),
                  submit: t("distributeSubmit"),
                  cancel: tCommon("action.cancel"),
                  irreversible: t("distributeIrreversible"),
                }}
              />
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("amountGross")} value={fmt.money(expense.amountMinor)} />
        <Stat label={t("amountNet")} value={fmt.money(netKurus)} />
        <Stat label={t("vatAmount")} value={fmt.money(expense.vatMinor)} />
        <Stat
          label={t("withholding")}
          value={fmt.money(expense.withholdingMinor)}
          tone={expense.withholdingMinor > 0 ? "warning" : "neutral"}
        />
      </div>

      {!distributed && expense.status === "pending_approval" ? (
        <div className="mb-4">
          <Alert tone="warning">{t("pendingApprovalNotice")}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("detailsTitle")} />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Row label={t("category")} value={detail.categoryName ?? "—"} />
              <Row
                label={t("distribution")}
                value={
                  detail.categoryDistribution
                    ? tEnum(`duesFormula.${detail.categoryDistribution}`)
                    : "—"
                }
              />
              <Row label={t("vendor")} value={expense.vendorName ?? "—"} />
              <Row label={t("invoiceNo")} value={expense.invoiceNo ?? "—"} />
              <Row
                label={t("expenseDate")}
                value={fmt.date(expense.expenseDate)}
              />
              <Row
                label={t("paidAt")}
                value={
                  expense.paidAt ? fmt.date(expense.paidAt) : t("notPaidYet")
                }
              />
              <Row label={t("paidVia")} value={expense.paidVia ?? "—"} />
              <Row
                label={t("period")}
                value={expense.period ? fmt.period(expense.period) : "—"}
              />
              <Row
                label={t("distributedAt")}
                value={
                  expense.distributedAt
                    ? fmt.dateTime(expense.distributedAt)
                    : t("notDistributedBadge")
                }
              />
              <Row
                label={t("vatRate")}
                value={`%${(Number(expense.vatRate) * 100).toFixed(0)}`}
              />
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("generatedDebtsTitle")}
            description={t("generatedDebtsHint")}
          />
          <CardBody className="p-0">
            {detail.generatedDebts.length === 0 ? (
              <p className="p-6 text-center text-sm text-fg-subtle">
                {t("noGeneratedDebts")}
              </p>
            ) : (
              <div className={`${tc.wrapper} max-h-96 overflow-y-auto`}>
                <table className={tc.table}>
                  <thead className={`${tc.thead} sticky top-0 bg-surface`}>
                    <tr>
                      <th scope="col" className={tc.th}>
                        {t("unit")}
                      </th>
                      <th scope="col" className={`${tc.th} text-right`}>
                        {t("amountGross")}
                      </th>
                      <th scope="col" className={tc.th}>
                        {t("status")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.generatedDebts.map((debt) => (
                      <tr key={debt.unitNumber} className={tc.tr}>
                        <td className={tc.td}>{debt.unitNumber}</td>
                        <td className={tc.tdNum}>
                          {fmt.money(debt.amountMinor)}
                        </td>
                        <td className={tc.td}>
                          <Badge
                            tone={
                              debt.status === "paid" ? "success" : "neutral"
                            }
                          >
                            {tEnum(`debtStatus.${debt.status}`)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </>
  );
}
