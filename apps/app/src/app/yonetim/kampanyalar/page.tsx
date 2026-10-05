import { getTranslations } from "next-intl/server";

import { platformCampaignList, platformManagerList, promoCodeList } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, EmptyState, Stat, tableClasses as tc } from "@yonetim/ui";

import { apiGet } from "@/lib/api/server";
import { formatters } from "@/lib/format";

import { CampaignStatusButton, CreatePromoCodeButton, TogglePromoCode } from "./campaign-forms";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.platformCampaigns");
  return { title: t("title"), robots: { index: false } };
}

/**
 * Platform → kampanyalar ve promosyon kodları.
 *
 * Kod, paket atamada (hesap detayı) uygulanıyor; burada tanımlanıyor,
 * izleniyor ve kapatılıyor. Kampanyalar vitrinde (fiyatlandırma sayfası)
 * görünen tekliflerin açık/kapalı anahtarı.
 */
export default async function PlatformCampaignsPage() {
  const t = await getTranslations("app.platformCampaigns");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const [codes, campaigns, managers] = await Promise.all([
    apiGet("/v1/panel/platform/promo-codes", promoCodeList),
    apiGet("/v1/panel/platform/campaigns", platformCampaignList),
    apiGet("/v1/panel/platform/managers?limit=200", platformManagerList),
  ]);

  const tenants = [...new Map(managers.rows.map((m) => [m.tenantId, m.tenantName])).entries()].map(
    ([value, label]) => ({ value, label }),
  );
  const campaignOptions = campaigns.rows.map((c) => ({ value: c.id, label: c.name }));
  const usable = codes.rows.filter((c) => c.usable).length;
  const redemptions = codes.rows.reduce((sum, c) => sum + c.usedCount, 0);
  const given = codes.rows.reduce((sum, c) => sum + c.totalDiscountMinor, 0);

  const codeState = (c: (typeof codes.rows)[number]) =>
    c.usable
      ? { tone: "success" as const, label: t("state.usable") }
      : !c.isActive
        ? { tone: "neutral" as const, label: t("state.inactive") }
        : c.validUntil.getTime() < Date.now()
          ? { tone: "neutral" as const, label: t("state.expired") }
          : c.usageLimit !== null && c.usedCount >= c.usageLimit
            ? { tone: "warning" as const, label: t("state.exhausted") }
            : { tone: "info" as const, label: t("state.scheduled") };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-fg">{t("title")}</h1>
          <p className="text-sm text-fg-subtle">{t("description")}</p>
        </div>
        <CreatePromoCodeButton tenants={tenants} campaigns={campaignOptions} />
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={t("stat.codes")} value={String(codes.rows.length)} />
        <Stat label={t("stat.usable")} value={String(usable)} tone="success" />
        <Stat label={t("stat.redemptions")} value={String(redemptions)} />
        <Stat label={t("stat.given")} value={f.money(given)} />
      </div>

      <Card>
        <CardHeader title={t("codesTitle")} description={t("codesDescription")} />
        <CardBody className="p-0">
          {codes.rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title={t("noCodes")} description={t("noCodesHint")} />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>{t("col.code")}</th>
                    <th scope="col" className={tc.th}>{t("col.discount")}</th>
                    <th scope="col" className={tc.th}>{t("col.validity")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("col.usage")}</th>
                    <th scope="col" className={tc.th}>{t("col.scope")}</th>
                    <th scope="col" className={`${tc.th} text-right`}>{t("col.given")}</th>
                    <th scope="col" className={tc.th}>{t("col.state")}</th>
                    <th scope="col" className={tc.th}>
                      <span className="sr-only">{t("col.action")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {codes.rows.map((c) => {
                    const state = codeState(c);
                    return (
                      <tr key={c.id} className={tc.tr}>
                        <td className={tc.td}>
                          <span className="font-mono font-semibold text-fg">{c.code}</span>
                          {c.campaignName ? <div className="text-xs text-fg-subtle">{c.campaignName}</div> : null}
                        </td>
                        <td className={tc.td}>
                          {c.discountType === "percent" ? `%${c.discountValue}` : f.money(Math.round(c.discountValue * 100))}
                        </td>
                        <td className={tc.tdMuted}>
                          {f.date(c.validFrom)} – {f.date(c.validUntil)}
                        </td>
                        <td className={tc.tdNum}>
                          {c.usedCount}
                          {c.usageLimit !== null ? ` / ${c.usageLimit}` : ""}
                        </td>
                        <td className={tc.td}>
                          {c.restrictedToTenantName ?? <span className="text-xs text-fg-subtle">{t("allSites")}</span>}
                        </td>
                        <td className={tc.tdNum}>{f.money(c.totalDiscountMinor)}</td>
                        <td className={tc.td}>
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </td>
                        <td className={tc.td}>
                          <TogglePromoCode id={c.id} isActive={c.isActive} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("campaignsTitle")} description={t("campaignsDescription")} />
        <CardBody className="p-0">
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  <th scope="col" className={tc.th}>{t("col.campaign")}</th>
                  <th scope="col" className={tc.th}>{t("col.period")}</th>
                  <th scope="col" className={`${tc.th} text-right`}>{t("col.usage")}</th>
                  <th scope="col" className={tc.th}>{t("col.state")}</th>
                  <th scope="col" className={tc.th}>
                    <span className="sr-only">{t("col.action")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.rows.map((c) => (
                  <tr key={c.id} className={tc.tr}>
                    <td className={tc.td}>
                      <div className="font-medium text-fg">{c.name}</div>
                      <div className="text-xs text-fg-subtle">
                        {c.code}
                        {c.showOnPricingPage ? ` · ${t("onPricingPage")}` : ""}
                      </div>
                    </td>
                    <td className={tc.tdMuted}>
                      {f.date(c.startsAt)} – {f.date(c.endsAt)}
                    </td>
                    <td className={tc.tdNum}>
                      {c.usageCount}
                      {c.usageLimit !== null ? ` / ${c.usageLimit}` : ""}
                    </td>
                    <td className={tc.td}>
                      <Badge tone={c.status === "active" ? "success" : c.status === "paused" ? "warning" : "neutral"}>
                        {tEnum(`campaignStatus.${c.status}`)}
                      </Badge>
                    </td>
                    <td className={tc.td}>
                      {c.status === "expired" ? null : <CampaignStatusButton id={c.id} status={c.status} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
