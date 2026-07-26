import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import {
  announcements, debtChanges, debts, payments, unitOccupancies, units, withTenant,
} from "@yonetim/db";
import {
  Alert, Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { requireContext } from "@/lib/context";
import { formatters } from "@/lib/format";

/**
 * Sakin self-servis portalı — SPEC Faz 2 / Bölüm 6.1.
 * Sakin yalnızca kendi bağımsız bölümünün verisini görür (debt:read_own).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.resident");
  return { title: t("title") };
}

export default async function ResidentPortalPage() {
  const ctx = await requireContext();
  const t = await getTranslations("app.resident");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await withTenant(ctx.tenantId, async (tx) => {
    const occ = await tx
      .select({
        unitId: unitOccupancies.unitId,
        number: units.number,
        relation: unitOccupancies.relation,
      })
      .from(unitOccupancies)
      .innerJoin(units, eq(units.id, unitOccupancies.unitId))
      .where(and(eq(unitOccupancies.userId, ctx.userId), isNull(unitOccupancies.endDate)))
      .limit(1);

    const unit = occ[0];
    if (!unit) return null;

    const debtRows = await tx
      .select()
      .from(debts)
      .where(and(eq(debts.unitId, unit.unitId), isNull(debts.deletedAt)))
      .orderBy(desc(debts.dueDate))
      .limit(24);

    const paymentRows = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.unitId, unit.unitId), eq(payments.status, "completed")))
      .orderBy(desc(payments.paidAt))
      .limit(12);

    const changes = await tx
      .select()
      .from(debtChanges)
      .where(and(eq(debtChanges.unitId, unit.unitId), eq(debtChanges.visibleToResident, true)))
      .orderBy(desc(debtChanges.createdAt))
      .limit(20);

    const announcementRows = await tx
      .select()
      .from(announcements)
      .where(and(isNull(announcements.deletedAt), sql`${announcements.publishedAt} IS NOT NULL`))
      .orderBy(desc(announcements.publishedAt))
      .limit(5);

    return { unit, debtRows, paymentRows, changes, announcementRows };
  });

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <EmptyState
          title={t("noUnitTitle")}
          description={t("noUnitDescription")}
          steps={[t("noUnitStep1"), t("noUnitStep2"), t("noUnitStep3")]}
        />
      </div>
    );
  }

  const now = new Date();
  const open = data.debtRows.filter((d) => d.status !== "paid");
  const total = open.reduce((a, d) => a + (d.amountKurus + d.lateFeeKurus - d.paidKurus), 0);
  const overdue = open
    .filter((d) => d.dueDate < now)
    .reduce((a, d) => a + (d.amountKurus + d.lateFeeKurus - d.paidKurus), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-fg">{ctx.tenantName}</h1>
          <p className="text-sm text-fg-subtle">
            {data.unit.number} · {tEnum(`ownership.${data.unit.relation}`)}
          </p>
        </div>
        <form action="/api/oturum/cikis" method="post">
          <button className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg hover:bg-hover">
            {tCommon("action.logout")}
          </button>
        </form>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label={t("currentDebt")}
          value={f.money(total)}
          tone={total > 0 ? "warning" : "success"}
        />
        <Stat
          label={t("overdue")}
          value={f.money(overdue)}
          tone={overdue > 0 ? "danger" : "success"}
        />
        <Stat
          label={t("lastPayment")}
          value={data.paymentRows[0] ? f.money(data.paymentRows[0].amountKurus) : "—"}
        />
      </div>

      {total > 0 ? (
        <Card>
          <CardHeader title={t("paymentTitle")} description={t("paymentDescription")} />
          <CardBody className="space-y-3">
            <Alert tone="info">{t("transparencyNote")}</Alert>
            <a
              href={`/odeme?tutar=${total}`}
              className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              {t("payAmount", { amount: f.money(total) })}
            </a>
          </CardBody>
        </Card>
      ) : (
        <Alert tone="success" title={t("noDebtTitle")}>
          {t("noDebtBody")}
        </Alert>
      )}

      <Card>
        <CardHeader title={t("debtBreakdown")} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("descriptionColumn")}</th>
                  <th scope="col" className={tc.th}>{t("dueDate")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("amount")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("lateFee")}</th>
                  <th scope="col" className={tc.th}>{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {data.debtRows.map((d) => (
                  <tr key={d.id} className={tc.tr}>
                    <td className={tc.td}>{d.description}</td>
                    <td className={tc.tdMuted}>{f.date(d.dueDate)}</td>
                    <td className={tc.tdNum}>{f.money(d.amountKurus)}</td>
                    <td className={tc.tdNum}>
                      {d.lateFeeKurus > 0 ? f.money(d.lateFeeKurus) : "—"}
                    </td>
                    <td className={tc.td}>
                      <Badge
                        tone={
                          d.status === "paid"
                            ? "success"
                            : d.dueDate < now
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {tEnum(`debtStatus.${d.status}`)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("changeHistoryTitle")}
          description={t("changeHistoryDescription")}
        />
        <CardBody className="space-y-2 text-sm">
          {data.changes.length === 0 ? (
            <p className="text-fg-subtle">{t("noChanges")}</p>
          ) : (
            data.changes.map((c) => (
              <div key={c.id} className="rounded border border-border p-3">
                <div className="flex justify-between">
                  <span className="font-medium text-fg">{t(`changeType.${c.changeType}`)}</span>
                  <span className="text-xs text-fg-subtle">{f.date(c.createdAt)}</span>
                </div>
                <div className="mt-1 text-fg-muted">
                  {f.money(Number(c.oldAmountKurus ?? 0))} → {f.money(Number(c.newAmountKurus ?? 0))}
                  {c.reason ? ` · ${c.reason}` : ""}
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("announcements")} />
        <CardBody className="space-y-2">
          {data.announcementRows.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noAnnouncements")}</p>
          ) : (
            data.announcementRows.map((a) => (
              <article key={a.id} className="rounded border border-border p-3">
                <h3 className="font-medium text-fg">{a.title}</h3>
                <p className="mt-1 text-sm text-fg-muted">{a.body}</p>
              </article>
            ))
          )}
        </CardBody>
      </Card>

      <p className="text-center text-xs text-fg-subtle">
        {tCommon.rich("legal.kvkkRightsNote", {
          kvkk: (chunks) => (
            <a href={`${siteConfig.env.baseUrl}/kvkk`} className="underline">
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  );
}
