import { and, desc, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { debts, unitOccupancies, units, withTenant } from "@yonetim/db";
import { calculateFees } from "@yonetim/payment";
import { Alert, Card, CardBody, CardFooter, CardHeader } from "@yonetim/ui";

import { requireContext } from "@/lib/context";
import { formatters } from "@/lib/format";
import { startCheckout } from "./actions";

/**
 * Ödeme ekranı — SPEC Bölüm 1.2 (şeffaf komisyon göstergesi) + 7.1.
 * Platform ücreti ve banka komisyonu ayrı satırlarda gösterilir.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.payment");
  return { title: t("summaryTitle") };
}

export default async function PaymentPage() {
  const ctx = await requireContext();
  const t = await getTranslations("app.payment");
  const f = await formatters();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const occ = await tx
      .select({ unitId: unitOccupancies.unitId, number: units.number })
      .from(unitOccupancies)
      .innerJoin(units, eq(units.id, unitOccupancies.unitId))
      .where(and(eq(unitOccupancies.userId, ctx.userId), isNull(unitOccupancies.endDate)))
      .limit(1);
    const unit = occ[0];
    if (!unit) return null;

    const open = await tx
      .select()
      .from(debts)
      .where(and(eq(debts.unitId, unit.unitId), isNull(debts.deletedAt)))
      .orderBy(desc(debts.dueDate));

    return { unit, open: open.filter((d) => d.amountKurus + d.lateFeeKurus - d.paidKurus > 0) };
  });

  if (!data || data.open.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Alert tone="success" title={t("noDebtTitle")}>
          {t("noDebtBody")}
        </Alert>
      </div>
    );
  }

  const total = data.open.reduce((a, d) => a + (d.amountKurus + d.lateFeeKurus - d.paidKurus), 0);
  const fees = calculateFees({ amountKurus: total, paidBy: "management" });

  return (
    <div className="mx-auto max-w-lg p-4 lg:p-6">
      <Card>
        <CardHeader
          title={t("summaryTitle")}
          description={`${data.unit.number} · ${ctx.tenantName}`}
        />
        <CardBody className="space-y-3 text-sm">
          <ul className="space-y-1">
            {data.open.map((d) => (
              <li key={d.id} className="flex justify-between">
                <span className="text-fg-muted">{d.description}</span>
                <span className="tabular-nums">
                  {f.money(d.amountKurus + d.lateFeeKurus - d.paidKurus)}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-border pt-3">
            <Row label={t("debtAmount")} value={f.money(fees.amountKurus)} />
            <Row label={t("platformFee")} value={f.money(fees.platformFeeKurus)} />
            <Row label={t("processorFee")} value={f.money(fees.processorFeeKurus)} />
            <Row label={t("payableAmount")} value={f.money(fees.totalKurus)} strong />
          </div>

          <Alert tone="info">
            {fees.paidBy === "management" ? t("feeByManagement") : t("feeByResident")}
          </Alert>
          <p className="text-xs text-fg-subtle">{t("securityNote")}</p>
        </CardBody>
        <CardFooter>
          <form action={startCheckout}>
            <input type="hidden" name="amountKurus" value={total} />
            <input type="hidden" name="unitId" value={data.unit.unitId} />
            <button className="w-full rounded-lg bg-primary px-5 py-3 font-semibold text-primary-fg hover:bg-primary-hover">
              {t("payButton", { amount: f.money(fees.totalKurus) })}
            </button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className={strong ? "font-semibold text-fg" : "text-fg-muted"}>{label}</span>
      <span className={strong ? "font-bold tabular-nums text-fg" : "tabular-nums"}>{value}</span>
    </div>
  );
}
