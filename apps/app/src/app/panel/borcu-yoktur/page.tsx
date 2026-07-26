import { desc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@yonetim/config";
import { debtCertificates, withTenant } from "@yonetim/db";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { CertificateRequestForm } from "@/components/certificate-form";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

/**
 * "Borcu Yoktur" belge motoru — SPEC Bölüm 3.6 (VURUCU ÖZELLİK).
 * Sakin self-servis talep eder, sistem borç durumunu kontrol eder,
 * doğrulama kodlu belge anında üretilir.
 */
export const dynamic = "force-dynamic";

export default async function DebtCertificatePage() {
  const ctx = await requirePermission("debt:read");
  const t = await getTranslations("app.certificate");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const rows = await withTenant(ctx.tenantId, async (tx) =>
    tx.select().from(debtCertificates).orderBy(desc(debtCertificates.createdAt)).limit(50),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CertificateRequestForm />

        <Card>
          <CardHeader
            title={t("issuedTitle")}
            description={tCommon("unit.record", { count: rows.length })}
          />
          <CardBody className="p-0">
            {rows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title={t("emptyTitle")}
                  description={t("emptyDescription")}
                  steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                  >
                    <div>
                      <div className="font-mono text-xs text-fg">{c.serialNo}</div>
                      <div className="text-xs text-fg-subtle">
                        {f.date(c.asOfDate)} ·{" "}
                        {t("verificationCodeLabel", { code: c.verificationCode })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={c.result === "clear" ? "success" : "warning"}>
                        {c.result === "clear" ? t("clear") : f.money(c.outstandingKurus)}
                      </Badge>
                      {c.kepSentAt ? <Badge tone="info">{t("kepSent")}</Badge> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Alert tone="info" title={t("verifyHintTitle")}>
          {t("verifyHintBody", { url: `${siteConfig.env.baseUrl}/belge/dogrula` })}
        </Alert>
      </div>
    </>
  );
}
