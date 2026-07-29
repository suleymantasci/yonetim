import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { siteConfig } from "@yonetim/config";
import {
  integrationStatusResponse,
  tenantSettingsResponse,
} from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

const STATE_TONE = {
  connected: "success",
  degraded: "warning",
  not_configured: "neutral",
  disabled: "neutral",
} as const;

/**
 * Site ayarları — PROJE-DURUMU §5.2/§5.5.
 *
 * İKİ ŞEY DEĞİŞTİ:
 *
 * 1. **Ekran artık düzenlenebilir.** Önceden yalnız görüntülüyordu;
 *    `settings:write` yetkisi tanımlıydı ve hiçbir yerde kullanılmıyordu.
 *
 * 2. **Entegrasyon rozetleri gerçeği söylüyor.** Önceden
 *    `siteConfig.features` içindeki **derleme zamanı** sabitlerinden
 *    geliyorlardı: "WhatsApp: aktif" rozeti site hakkında hiçbir şey
 *    söylemiyor, ürün hakkında konuşuyordu. Artık kimlik bilgisi tanımlı mı,
 *    hangi kapsamdan geliyor (site ayarı / platform) ve son gönderim ne zaman
 *    oldu — üçü ayrı ayrı görünüyor.
 */
export default async function SettingsPage() {
  const ctx = await requirePermission("settings:read");
  const t = await getTranslations("app.settings");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const [tenant, integrations] = await Promise.all([
    apiGet("/v1/panel/settings", tenantSettingsResponse),
    apiGet("/v1/panel/settings/integrations", integrationStatusResponse),
  ]);

  const settings = tenant.settings as {
    duesDueDayOfMonth?: number;
    lateFeeEnabled?: boolean;
    lateFeeMonthlyPct?: number | null;
    kvkkContactEmail?: string | null;
    whatsappOptInRequired?: boolean;
    payment?: { onlineEnabled?: boolean; feePaidBy?: string };
    invoiceInfo?: {
      title?: string | null;
      taxNumber?: string | null;
      taxOffice?: string | null;
      address?: string | null;
    };
  };

  const canWrite = hasPermission(ctx.roles, "settings:write");
  const none = tCommon("state.none");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {canWrite ? (
            <Card>
              <CardBody>
                <SettingsForm
                  submitLabel={tCommon("action.save")}
                  defaults={{
                    name: tenant.name,
                    city: tenant.city,
                    district: tenant.district,
                    neighborhood: tenant.neighborhood,
                    addressLine: tenant.addressLine,
                    postalCode: tenant.postalCode,
                    duesDueDayOfMonth: settings.duesDueDayOfMonth ?? 10,
                    lateFeeEnabled: settings.lateFeeEnabled !== false,
                    lateFeeMonthlyPct: String(
                      settings.lateFeeMonthlyPct ??
                        siteConfig.dues.monthlyLateFeePct,
                    ),
                    kvkkContactEmail: settings.kvkkContactEmail ?? null,
                    invoiceTitle: settings.invoiceInfo?.title ?? null,
                    invoiceTaxNumber: settings.invoiceInfo?.taxNumber ?? null,
                    invoiceTaxOffice: settings.invoiceInfo?.taxOffice ?? null,
                    invoiceAddress: settings.invoiceInfo?.address ?? null,
                    whatsappOptInRequired:
                      settings.whatsappOptInRequired !== false,
                    // Varsayılan **kapalı**: ayarı hiç görmemiş bir site
                    // kartla tahsilatı açmış sayılmaz (API tarafındaki
                    // `readPaymentSettings` ile aynı kural).
                    onlinePaymentEnabled:
                      settings.payment?.onlineEnabled === true,
                    paymentFeePaidBy:
                      settings.payment?.feePaidBy === "resident"
                        ? "resident"
                        : "management",
                  }}
                />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title={t("propertyInfo")} />
              <CardBody className="space-y-2 text-sm">
                <Alert tone="info">{t("readOnlyNotice")}</Alert>
                <Row label={t("propertyName")} value={tenant.name} />
                <Row
                  label={t("cityDistrict")}
                  value={
                    [tenant.city, tenant.district].filter(Boolean).join(" / ") ||
                    none
                  }
                />
                <Row
                  label={t("dueDay")}
                  value={String(settings.duesDueDayOfMonth ?? 10)}
                />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title={t("integrations")}
              description={t("integrationsHint")}
            />
            <CardBody className="space-y-3">
              {integrations.rows.map((row) => (
                <div key={row.key} className="rounded border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg">
                      {t(`integration.${row.key}`)}
                    </span>
                    <Badge tone={STATE_TONE[row.state]}>
                      {t(`integrationState.${row.state}`)}
                    </Badge>
                  </div>

                  {/*
                    Kapsam yalnız bağlıyken anlamlı ve WhatsApp'ta asıl soruyu
                    cevaplıyor: mesaj bizim numaramızdan mı sitenin kendi
                    numarasından mı gidiyor (karma model, §5.5).
                  */}
                  {row.scope !== "none" ? (
                    <p className="mt-1 text-xs text-fg-subtle">
                      {t(`integrationScope.${row.scope}`)}
                    </p>
                  ) : null}

                  {row.lastSuccessAt ? (
                    <p className="mt-1 text-xs text-fg-muted">
                      {t("lastSuccessAt", {
                        date: f.dateTime(row.lastSuccessAt),
                        count: row.sentLast30Days,
                      })}
                    </p>
                  ) : null}

                  {row.lastError ? (
                    <p className="mt-1 text-xs text-danger-fg">
                      {row.lastError}
                    </p>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("subscription")} />
            <CardBody className="space-y-2 text-sm">
              <Row label={t("slug")} value={tenant.slug} />
              <Row
                label={t("type")}
                value={tEnum(`tenantType.${tenant.type}`)}
              />
              <Row label={t("unitCount")} value={String(tenant.unitCount)} />
              <Row
                label={t("status")}
                value={tEnum(`tenantStatus.${tenant.status}`)}
              />
              <Row
                label={t("trialEndsAt")}
                value={
                  tenant.trialEndsAt ? f.date(tenant.trialEndsAt) : none
                }
              />
              <Row
                label={t("periodEnd")}
                value={
                  tenant.currentPeriodEnd
                    ? f.date(tenant.currentPeriodEnd)
                    : none
                }
              />
              <Row
                label={t("landingPage")}
                value={
                  tenant.landingPublished
                    ? `${siteConfig.env.baseUrl}/${tenant.slug}`
                    : t("landingUnpublished")
                }
              />
              {/*
                Bu kart bilinçle salt-okunur: `slug` basılmış her bağlantıyı
                (landing, QR, paylaşılan adres) taşıyor, daire sayısı `units`
                tablosundan türüyor, abonelik alanları faturalandırmanın
                sonucu. Düzenlenebilir yapmak üçünde de gerçekle çelişen bir
                ikinci kaynak üretirdi.
              */}
              <Alert tone="info">
                {t("priceCapNote", {
                  pct: siteConfig.billing.maxYearlyPriceIncreasePct,
                  days: siteConfig.billing.refundPeriodDays,
                })}
              </Alert>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-fg-subtle">{label}</span>
      <span className="text-right font-medium text-fg">{value}</span>
    </div>
  );
}
