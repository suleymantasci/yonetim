"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert, Card, CardBody, CardFooter, CardHeader, Field, Input } from "@yonetim/ui";

import { issueDebtCertificate, type CertificateState } from "@/app/panel/borcu-yoktur/actions";
import { useFormat } from "@/lib/use-format";

const INITIAL: CertificateState = { ok: false };

export function CertificateRequestForm() {
  const t = useTranslations("app.certificate");
  const tCommon = useTranslations("common");
  const f = useFormat();
  const [state, action, pending] = useActionState(issueDebtCertificate, INITIAL);

  return (
    <Card>
      <CardHeader title={t("newTitle")} description={t("newDescription")} />
      <form action={action}>
        <CardBody className="space-y-4">
          <Field label={t("unitNumberLabel")} required>
            <Input name="unitNumber" required placeholder={t("unitNumberPlaceholder")} />
          </Field>
          <Field label={t("kepLabel")} hint={t("kepHint")}>
            <Input name="kepRecipient" type="text" placeholder="kurum@hs01.kep.tr" />
          </Field>

          {state.message ? (
            <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
          ) : null}

          {state.certificate ? (
            <div className="rounded-lg border border-border p-4 text-sm">
              <div className="font-heading text-base font-bold text-fg">
                {state.certificate.result === "clear"
                  ? t("docTitleClear")
                  : t("docTitleOutstanding")}
              </div>
              <dl className="mt-3 space-y-1">
                <Row label={t("serialNo")} value={state.certificate.serialNo} />
                <Row label={t("verificationCode")} value={state.certificate.verificationCode} />
                <Row label={t("unit")} value={state.certificate.unitLabel} />
                <Row
                  label={t("debtStatus")}
                  value={
                    state.certificate.result === "clear"
                      ? t("noDebt")
                      : f.money(state.certificate.outstandingKurus)
                  }
                />
                <Row
                  label={t("issuedAt")}
                  value={f.date(new Date(state.certificate.asOfDate))}
                />
              </dl>
              <button
                type="button"
                onClick={() => window.print()}
                className="mt-4 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-semibold text-fg hover:bg-hover"
              >
                {tCommon("action.print")}
              </button>
            </div>
          ) : null}
        </CardBody>
        <CardFooter>
          <button
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? t("issuing") : t("issue")}
          </button>
        </CardFooter>
      </form>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </div>
  );
}
