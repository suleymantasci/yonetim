import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

import { debtCertificates, tenants, withBypassRls } from "@yonetim/db";
import { Alert, Card, CardBody, CardHeader, Field, Input } from "@yonetim/ui";

import { formatters } from "@/lib/format";

/**
 * Belge doğrulama — SPEC Bölüm 3.6.
 * Bankalar/kurumlar belge numarası + doğrulama kodu ile gerçekliği teyit eder.
 * Kimlik doğrulaması gerektirmez; yalnızca belge geçerliliğini döner (kişisel veri sızmaz).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.verify");
  return { title: t("title"), robots: { index: false } };
}

export default async function VerifyCertificatePage({
  searchParams,
}: {
  searchParams: Promise<{ no?: string; kod?: string }>;
}) {
  const { no, kod } = await searchParams;
  const t = await getTranslations("app.verify");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const record = no && kod ? await lookup(no.trim(), kod.trim().toUpperCase()) : null;

  return (
    <div className="mx-auto max-w-lg p-6">
      <Card>
        <CardHeader title={t("title")} description={t("description")} />
        <CardBody className="space-y-4">
          <form className="space-y-3" action="/belge/dogrula">
            <Field label={t("serialLabel")} required>
              <Input name="no" defaultValue={no} placeholder="BYB-2026-000045" required />
            </Field>
            <Field label={t("codeLabel")} required>
              <Input name="kod" defaultValue={kod} placeholder="8KD2QF9A" required />
            </Field>
            <button className="w-full rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-fg hover:bg-primary-hover">
              {tCommon("action.verify")}
            </button>
          </form>

          {record === null ? null : record.valid ? (
            <Alert tone="success" title={t("validTitle")}>
              <dl className="mt-1 space-y-1 text-sm">
                <Row label={t("issuer")} value={record.tenantName} />
                <Row label={t("issuedAt")} value={f.date(record.asOfDate)} />
                <Row
                  label={t("result")}
                  value={
                    record.result === "clear"
                      ? t("resultClear")
                      : t("resultOutstanding", { amount: f.money(record.outstandingKurus) })
                  }
                />
              </dl>
              <p className="mt-2 text-xs">{t("validNote")}</p>
            </Alert>
          ) : (
            <Alert tone="danger" title={t("invalidTitle")}>
              {t("invalidBody")}
            </Alert>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/** Yalnızca doğrulama için gereken alanları döner — kişisel veri taşımaz. */
async function lookup(serialNo: string, code: string) {
  return withBypassRls("certificate:verify", async (tx) => {
    const rows = await tx
      .select({
        result: debtCertificates.result,
        outstandingKurus: debtCertificates.outstandingKurus,
        asOfDate: debtCertificates.asOfDate,
        tenantName: tenants.name,
      })
      .from(debtCertificates)
      .innerJoin(tenants, eq(tenants.id, debtCertificates.tenantId))
      .where(
        and(eq(debtCertificates.serialNo, serialNo), eq(debtCertificates.verificationCode, code)),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return { valid: false as const };

    return {
      valid: true as const,
      tenantName: row.tenantName,
      asOfDate: row.asOfDate,
      result: row.result,
      outstandingKurus: row.outstandingKurus,
    };
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="opacity-80">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
