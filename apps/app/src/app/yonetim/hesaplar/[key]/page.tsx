import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { platformAccountDetail, platformPlanList } from "@yonetim/contracts";
import {
  Alert, Badge, Card, CardBody, CardHeader, Stat, tableClasses as tc,
} from "@yonetim/ui";

import { apiGet } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import {
  AccountActionForm,
  AddonForm,
  ExtendForm,
  ImpersonateForm,
  TenantActionForm,
} from "./action-forms";
import { AssignPackageForm } from "./assign-form";

/**
 * Hesap detayı — SPEC Bölüm 18.1 #1–#4 ve #2'nin impersonation kısmı.
 *
 * Sorunun tamamı tek ekranda: hesabın siteleri, her sitenin aboneliği ve SMS
 * kotası, hesabın kullanıcıları, faturaları, satın aldığı ek paketler ve
 * hepsinin üzerinde çalışan aksiyonlar.
 *
 * NEDEN TEK ÇAĞRI: "bir ekran = bir çağrı" (§9a). Beş bölümün her biri için
 * ayrı uç açmak, bir hesaba bakmayı beş gidiş-dönüşe çıkarırdı ve destek
 * personeli gün içinde onlarca hesaba bakıyor.
 *
 * AKSİYONLARIN GÖRÜNÜRLÜĞÜ İZNE BAĞLI ama gerçek kapı uçta: `support_agent`
 * listeyi ve detayı görüyor, hesaba geçemiyor ve site silemiyor. Ekranda
 * gizlemek yalnız "basınca hata alacağın düğmeyi gösterme" nezaketi.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.platformAccounts");
  return { title: t("detailTitle"), robots: { index: false } };
}

export default async function PlatformAccountDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const ctx = await requirePermission("admin:tenants");
  const { key } = await params;
  const accountKey = decodeURIComponent(key);

  const t = await getTranslations("app.platformAccounts");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await apiGet(
    `/v1/panel/platform/accounts/${encodeURIComponent(accountKey)}`,
    platformAccountDetail,
  );
  const { account, sites, users, invoices, addons } = data;

  const canImpersonate = can(ctx, "admin:impersonate");
  const canPurge = can(ctx, "tenant:delete");
  const canBill = can(ctx, "admin:billing");
  const planList = canBill ? await apiGet("/v1/panel/platform/plans", platformPlanList) : { rows: [] };
  // Paket atanabilecek siteler: arşiv/iptal dışındakiler.
  const assignableSites = sites
    .filter((site) => site.status !== "archived" && site.status !== "cancelled")
    .map((site) => ({ id: site.id, name: site.name, unitCount: site.unitCount }));

  /*
   * Aksiyon formlarının site listesi: arşivdekiler de dâhil. Geri açma ve
   * kalıcı silme tam olarak o siteler üzerinde çalışıyor; filtrelemek
   * kurtarma düğmesini erişilemez yapardı.
   */
  const siteOptions = sites.map((site) => ({
    id: site.id,
    name: site.status === "archived" ? `${site.name} (${tEnum("tenantStatus.archived")})` : site.name,
    status: site.status,
  }));

  const archivedWithWindow = sites.filter(
    (site) => site.status === "archived" && site.daysLeftToRecover !== null,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-extrabold text-fg">{account.name}</h1>
            <Badge tone={account.kind === "company" ? "info" : "neutral"}>
              {t(`kind.${account.kind}`)}
            </Badge>
          </div>
          <p className="text-sm text-fg-subtle">
            {[account.contactName, account.contactEmail, account.contactPhone]
              .filter(Boolean)
              .join(" · ") || t("noContact")}
          </p>
        </div>
        <Link href="/yonetim/hesaplar" className="text-sm underline hover:no-underline">
          {t("backToList")}
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("col.sites")} value={String(account.siteCount)} />
        <Stat label={t("col.units")} value={String(account.unitCount)} />
        <Stat label={t("col.yearly")} value={f.money(account.yearlyPriceMinor)} />
        <Stat
          label={t("col.outstanding")}
          value={f.money(account.outstandingMinor)}
          tone={account.outstandingMinor > 0 ? "warning" : "success"}
          hint={t("paidTotal", { amount: f.money(account.paidTotalMinor) })}
        />
      </div>

      {/*
        Kurtarma penceresi biten siteler için uyarı en üstte: bu, ekranda
        zaman sınırı olan **tek** bilgi. Tablonun içinde bir sütun olarak
        kalsa, 20 siteli bir hesapta gözden kaçardı.
      */}
      {archivedWithWindow.length > 0 ? (
        <Alert tone="warning" title={t("recoveryWindowTitle")}>
          <ul className="list-inside list-disc">
            {archivedWithWindow.map((site) => (
              <li key={site.id}>
                {t("recoveryWindowItem", {
                  name: site.name,
                  days: site.daysLeftToRecover ?? 0,
                })}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {/* ------------------------------------------------------- siteler */}
      <Card>
        <CardHeader title={t("sitesTitle")} description={t("sitesDescription")} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("col.site")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("col.units")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("col.residents")}</th>
                  <th scope="col" className={tc.th}>{t("col.plan")}</th>
                  <th scope="col" className={tc.th}>{t("col.subscription")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("col.smsUsage")}</th>
                  <th scope="col" className={tc.th}>{t("col.periodEnd")}</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id} className={tc.tr}>
                    <td className={tc.td}>
                      <div className="font-medium text-fg">{site.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                        <span>{site.slug}</span>
                        <Badge tone={site.status === "active" ? "success" : "neutral"}>
                          {tEnum(`tenantStatus.${site.status}`)}
                        </Badge>
                        {site.daysLeftToRecover !== null ? (
                          <span className="font-semibold text-warning-fg">
                            {t("daysLeft", { days: site.daysLeftToRecover })}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={tc.tdNum}>{site.unitCount}</td>
                    <td className={tc.tdNum}>{site.residentCount}</td>
                    <td className={tc.td}>{site.subscription?.planName ?? "—"}</td>
                    <td className={tc.td}>
                      {site.subscription ? (
                        <>
                          <Badge tone={subscriptionTone(site.subscription.status)}>
                            {tEnum(`subscriptionStatus.${site.subscription.status}`)}
                          </Badge>
                          {site.subscription.dunningStep > 0 ? (
                            <div className="mt-1 text-xs font-semibold text-danger-fg">
                              {t("dunningStep", { step: site.subscription.dunningStep })}
                            </div>
                          ) : null}
                          {site.subscription.cancelAtPeriodEnd ? (
                            <div className="mt-1 text-xs text-fg-subtle">
                              {t("cancelAtPeriodEnd")}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-fg-subtle">{t("noSubscription")}</span>
                      )}
                    </td>
                    <td className={tc.tdNum}>
                      {site.subscription
                        ? `${site.subscription.smsUsedThisPeriod} / ${site.subscription.smsQuotaYearly}`
                        : "—"}
                    </td>
                    <td className={tc.tdMuted}>
                      {site.subscription?.currentPeriodEndAt
                        ? f.date(site.subscription.currentPeriodEndAt)
                        : site.trialEndsAt
                          ? t("trialUntil", { date: f.date(site.trialEndsAt) })
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* --------------------------------------------------- kullanıcılar */}
        <Card>
          <CardHeader title={t("usersTitle")} description={t("usersDescription")} />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("col.user")}</th>
                    <th scope="col" className={tc.th}>{t("col.roles")}</th>
                    <th scope="col" className={tc.th}>{t("col.lastLogin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={tc.tr}>
                      <td className={tc.td}>
                        <div className="font-medium text-fg">{user.name}</div>
                        <div className="text-xs text-fg-subtle">
                          {user.email ?? user.phone ?? "—"}
                        </div>
                      </td>
                      <td className={tc.td}>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={role} tone="neutral">
                              {tEnum(`role.${role}`)}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className={tc.tdMuted}>
                        {user.lastLoginAt ? f.date(user.lastLoginAt) : t("neverLoggedIn")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* ------------------------------------------------------ ek paketler */}
        <Card>
          <CardHeader title={t("addonsTitle")} description={t("addonsDescription")} />
          <CardBody className={addons.length === 0 ? undefined : "p-0"}>
            {addons.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noAddons")}</p>
            ) : (
              <div className={tc.wrapper}>
                <table className={tc.table}>
                  <thead className={tc.thead}>
                    <tr>
                      <th scope="col" className={tc.th}>{t("col.addon")}</th>
                      <th scope="col" className={`${tc.th} text-right`}>{t("col.remaining")}</th>
                      <th scope="col" className={`${tc.th} text-right`}>{t("col.price")}</th>
                      <th scope="col" className={tc.th}>{t("col.validUntil")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addons.map((addon) => (
                      <tr key={addon.id} className={tc.tr}>
                        <td className={tc.td}>
                          <div className="font-medium text-fg">{addon.name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
                            <span>{addon.tenantName}</span>
                            <Badge tone={addon.source === "purchase" ? "success" : "info"}>
                              {t(`addonSource.${addon.source}`)}
                            </Badge>
                          </div>
                        </td>
                        <td className={tc.tdNum}>
                          {addon.remainingQuantity} / {addon.purchasedQuantity}
                        </td>
                        <td className={tc.tdNum}>{f.money(addon.totalPriceMinor)}</td>
                        <td className={tc.tdMuted}>
                          {addon.validUntil ? f.date(addon.validUntil) : t("noExpiry")}
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

      {/* --------------------------------------------------------- faturalar */}
      <Card>
        <CardHeader title={t("invoicesTitle")} description={t("invoicesDescription")} />
        <CardBody className={invoices.length === 0 ? undefined : "p-0"}>
          {invoices.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noInvoices")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("col.invoiceNo")}</th>
                    <th scope="col" className={tc.th}>{t("col.site")}</th>
                    <th scope="col" className={tc.th}>{t("col.invoiceStatus")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("col.total")}</th>
                    <th scope="col" className={tc.th}>{t("col.due")}</th>
                    <th scope="col" className={tc.th}>{t("col.paid")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className={tc.tr}>
                      <td className={tc.td}>{invoice.invoiceNo}</td>
                      <td className={tc.tdMuted}>{invoice.tenantName}</td>
                      <td className={tc.td}>
                        <Badge tone={invoiceTone(invoice.status)}>
                          {tEnum(`invoiceStatus.${invoice.status}`)}
                        </Badge>
                      </td>
                      <td className={tc.tdNum}>{f.money(invoice.totalMinor)}</td>
                      <td className={tc.tdMuted}>
                        {invoice.dueAt ? f.date(invoice.dueAt) : "—"}
                      </td>
                      <td className={tc.tdMuted}>
                        {invoice.paidAt ? f.date(invoice.paidAt) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ------------------------------------------------------ paket atama */}
      {canBill && assignableSites.length > 0 && planList.rows.length > 0 ? (
        <Card>
          <CardHeader title={t("assignTitle")} description={t("assignDescription")} />
          <CardBody>
            <AssignPackageForm
              sites={assignableSites}
              plans={planList.rows.map((plan) => ({
                id: plan.id,
                name: plan.name,
                yearlyPriceMinor: plan.yearlyPriceMinor,
                minUnits: plan.minUnits,
                maxUnits: plan.maxUnits,
              }))}
            />
          </CardBody>
        </Card>
      ) : null}

      {/* --------------------------------------------------------- aksiyonlar */}
      <div className="grid gap-4 lg:grid-cols-2">
        {canBill ? (
          <>
            <Card>
              <CardHeader title={t("extendTitle")} description={t("extendDescription")} />
              <CardBody>
                <ExtendForm sites={siteOptions} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t("addonGrantTitle")} description={t("addonGrantDescription")} />
              <CardBody>
                <AddonForm sites={siteOptions} />
              </CardBody>
            </Card>
          </>
        ) : null}

        <Card>
          <CardHeader title={t("tenantActionTitle")} description={t("tenantActionDescription")} />
          <CardBody>
            <TenantActionForm sites={siteOptions} canPurge={canPurge} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("accountActionTitle")} description={t("accountActionDescription")} />
          <CardBody>
            <AccountActionForm accountKey={account.key} />
          </CardBody>
        </Card>

        {canImpersonate ? (
          <Card className="lg:col-span-2">
            <CardHeader
              title={t("impersonateTitle")}
              description={t("impersonateDescription")}
            />
            <CardBody>
              <ImpersonateForm
                users={users
                  // Platform kullanıcısına ve silinmiş hesaba geçilemez; uç
                  // ikisini de reddediyor, listede göstermek boşuna deneme
                  // olurdu.
                  .filter((user) => !user.isPlatformUser && user.status === "active")
                  .map((user) => ({ id: user.id, name: user.name, roles: user.roles }))}
                sites={sites
                  // Arşiv/iptal sitede geçişin anlamı yok: hedef kullanıcı
                  // salt-okunur bir kabuk görürdü.
                  .filter((site) => site.status !== "archived" && site.status !== "cancelled")
                  .map((site) => ({ id: site.id, name: site.name, status: site.status }))}
              />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function subscriptionTone(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "trialing":
      return "info";
    case "past_due":
    case "grace":
      return "warning";
    case "suspended":
      return "danger";
    default:
      return "neutral";
  }
}

function invoiceTone(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (status) {
    case "paid":
      return "success";
    case "issued":
      return "info";
    case "overdue":
      return "danger";
    case "refunded":
      return "warning";
    default:
      return "neutral";
  }
}
