import { Ban } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";

import { siteConfig } from "@yonetim/config";
import { debtCertificateListResponse } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Textarea,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import { FormField } from "@/components/form/action-form";
import { CertificateRequestForm } from "@/components/certificate-form";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { voidCertificate } from "./actions";

/**
 * "Borcu Yoktur" belge motoru — SPEC Bölüm 3.6 (VURUCU ÖZELLİK).
 * Sakin self-servis talep eder, sistem borç durumunu kontrol eder,
 * doğrulama kodlu belge anında üretilir.
 */
export const dynamic = "force-dynamic";

export default async function DebtCertificatePage() {
  const ctx = await requirePermission("debt:read");
  const canWrite = hasPermission(ctx.roles, "certificate:write");
  const t = await getTranslations("app.certificate");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const { rows } = await apiGet(
    "/v1/panel/certificates",
    debtCertificateListResponse,
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
                      <div className="font-mono text-xs text-fg">
                        {c.serialNo}
                      </div>
                      <div className="text-xs text-fg-subtle">
                        {f.date(c.asOfDate)} ·{" "}
                        {t("verificationCodeLabel", {
                          code: c.verificationCode,
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.voidedAt ? (
                        <Badge tone="danger">{t("voidedBadge")}</Badge>
                      ) : null}
                      <Badge
                        tone={c.result === "clear" ? "success" : "warning"}
                      >
                        {c.result === "clear"
                          ? t("clear")
                          : f.money(c.outstandingMinor)}
                      </Badge>
                      {c.kepSentAt ? (
                        <Badge tone="info">{t("kepSent")}</Badge>
                      ) : null}
                      {canWrite && !c.voidedAt ? (
                        <ActionDrawerButton
                          action={voidCertificate}
                          hidden={{ id: c.id }}
                          icon={<Ban />}
                          tone="danger"
                          label={t("voidAction")}
                          title={t("voidTitle")}
                          description={`${c.serialNo} · ${c.unitNumber ?? ""}`}
                          warning={t("voidWarning")}
                          submitLabel={t("voidConfirm")}
                        >
                          <FormField name="reason" label={t("voidReason")} hint={t("voidReasonHint")} required>
                            <Textarea name="reason" rows={3} minLength={10} maxLength={500} required />
                          </FormField>
                        </ActionDrawerButton>
                      ) : null}
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
          {t("verifyHintBody", {
            url: `${siteConfig.env.baseUrl}/belge/dogrula`,
          })}
        </Alert>
      </div>
    </>
  );
}
