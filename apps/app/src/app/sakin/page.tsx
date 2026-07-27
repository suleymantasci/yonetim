import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { portalOverview } from "@yonetim/contracts";
import {
  Alert, Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { apiGet } from "@/lib/api/server";
import { formatters } from "@/lib/format";

/**
 * Sakin self-servis portalı — SPEC Faz 2 / Bölüm 6.1.
 *
 * Sakin yalnızca kendi bağımsız bölümünün verisini görür. Kapsamı bu dosya
 * değil `apps/api` belirliyor: daire oturumdan bulunuyor, istemci bir daire
 * kimliği gönderemiyor. Ekranın gösterdiği her satır zaten kapsanmış geliyor.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.resident");
  return { title: t("title") };
}

export default async function ResidentPortalPage() {
  const t = await getTranslations("app.resident");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await apiGet("/v1/panel/portal/me", portalOverview);

  if (!data.unit) {
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

  // Toplamlar ve "gecikti mi" işareti sunucudan geliyor: tarayıcı saatiyle
  // hesaplanan bir gecikme, saati yanlış kurulmuş cihazda yanlış cevap verir.
  const { outstandingMinor: total, overdueMinor: overdue } = data.totals;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-fg">{data.tenantName}</h1>
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
          value={
            data.totals.lastPaymentMinor === null
              ? "—"
              : f.money(data.totals.lastPaymentMinor)
          }
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
                {data.debts.map((d) => (
                  <tr key={d.id} className={tc.tr}>
                    <td className={tc.td}>{d.description}</td>
                    <td className={tc.tdMuted}>{f.date(d.dueDate)}</td>
                    <td className={tc.tdNum}>{f.money(d.amountMinor)}</td>
                    <td className={tc.tdNum}>
                      {d.lateFeeMinor > 0 ? f.money(d.lateFeeMinor) : "—"}
                    </td>
                    <td className={tc.td}>
                      <Badge
                        tone={
                          d.status === "paid"
                            ? "success"
                            : d.overdue
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
                  {f.money(c.oldAmountMinor)} → {f.money(c.newAmountMinor)}
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
          {data.announcements.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noAnnouncements")}</p>
          ) : (
            data.announcements.map((a) => (
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
