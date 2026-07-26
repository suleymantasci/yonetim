import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { tenants, withTenant } from "@yonetim/db";
import { Alert, Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

const INTEGRATIONS = [
  { key: "whatsapp", enabled: siteConfig.features.whatsappBot },
  { key: "sms", enabled: siteConfig.features.smsNotify },
  { key: "payment", enabled: true },
  { key: "bank", enabled: siteConfig.features.bankIntegration },
  { key: "einvoice", enabled: false },
  { key: "kep", enabled: false },
] as const;

export default async function SettingsPage() {
  const ctx = await requirePermission("settings:read");
  const t = await getTranslations("app.settings");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const [tenant] = await withTenant(ctx.tenantId, async (tx) =>
    tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1),
  );

  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const none = tCommon("state.none");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("propertyInfo")} />
          <CardBody className="space-y-2 text-sm">
            <Row label={t("propertyName")} value={tenant?.name ?? none} />
            <Row label={t("slug")} value={tenant?.slug ?? none} />
            <Row
              label={t("type")}
              value={tenant ? tEnum(`tenantType.${tenant.type}`) : none}
            />
            <Row label={t("unitCount")} value={String(tenant?.unitCount ?? 0)} />
            <Row
              label={t("cityDistrict")}
              value={[tenant?.city, tenant?.district].filter(Boolean).join(" / ") || none}
            />
            <Row
              label={t("landingPage")}
              value={
                tenant?.landingPublished
                  ? `${siteConfig.env.baseUrl}/${tenant.slug}`
                  : t("landingUnpublished")
              }
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("duesRules")} />
          <CardBody className="space-y-2 text-sm">
            <Row label={t("dueDay")} value={String(settings.duesDueDayOfMonth ?? 10)} />
            <Row
              label={t("lateFee")}
              value={
                settings.lateFeeEnabled === false
                  ? t("lateFeeDisabled")
                  : t("lateFeeValue", {
                      pct: String(settings.lateFeeMonthlyPct ?? siteConfig.dues.monthlyLateFeePct),
                    })
              }
            />
            <Row
              label={t("legalThreshold")}
              value={tCommon("unit.days", { count: siteConfig.dues.legalActionThresholdDays })}
            />
            <Row
              label={t("earlyPaymentDiscount")}
              value={f.percent(siteConfig.dues.earlyPaymentDiscountPct / 100)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("integrations")} />
          <CardBody className="space-y-2">
            {INTEGRATIONS.map((i) => (
              <div key={i.key} className="flex items-center justify-between text-sm">
                <span className="text-fg">{t(`integration.${i.key}`)}</span>
                <Badge tone={i.enabled ? "success" : "neutral"}>
                  {i.enabled ? tCommon("state.active") : tCommon("state.inactive")}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("subscription")} />
          <CardBody className="space-y-2 text-sm">
            <Row
              label={t("status")}
              value={tenant ? tEnum(`tenantStatus.${tenant.status}`) : none}
            />
            <Row
              label={t("trialEndsAt")}
              value={tenant?.trialEndsAt ? f.date(new Date(tenant.trialEndsAt)) : none}
            />
            <Row
              label={t("periodEnd")}
              value={tenant?.currentPeriodEnd ? f.date(new Date(tenant.currentPeriodEnd)) : none}
            />
            <Alert tone="info">
              {t("priceCapNote", {
                pct: siteConfig.billing.maxYearlyPriceIncreasePct,
                days: siteConfig.billing.refundPeriodDays,
              })}
            </Alert>
          </CardBody>
        </Card>
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
