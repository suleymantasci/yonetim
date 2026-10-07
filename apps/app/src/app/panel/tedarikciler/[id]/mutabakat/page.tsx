import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { vendorDetail } from "@yonetim/contracts";
import { Card, CardBody, Input } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { parseDay } from "../../../raporlar/report-tools";

export const dynamic = "force-dynamic";

/**
 * Firma mutabakat mektubu — tedarikçiye gönderilen bakiye teyidi. Bakiye
 * cari ekstreden (giderler + açılış) seçilen günün sonuna kadar.
 */
export default async function VendorConfirmationPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("vendor:read");
  const t = await getTranslations("app.vendors");
  const f = await formatters();
  const at = parseDay((await searchParams).at);
  const data = await apiGet(`/v1/panel/vendors/${id}`, vendorDetail).catch(
    () => null,
  );
  if (!data) notFound();
  const end = new Date(`${at}T23:59:59.999+03:00`).getTime();
  const lines = data.ledger.filter((l) => l.date.getTime() <= end);
  const balance = lines.reduce((s, l) => s + l.creditMinor - l.debitMinor, 0);
  const atLabel = f.date(new Date(`${at}T12:00:00`));
  const v = data.vendor;

  return (
    <>
      <PageHeader
        title={t("confirmationTitle")}
        description={v.name}
        breadcrumb={[
          { label: t("title"), href: "/panel/tedarikciler" },
          { label: v.name, href: `/panel/tedarikciler/${v.id}` },
          { label: t("confirmationTitle") },
        ]}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <form method="get" className="flex items-end gap-2 print:hidden">
              <label className="text-xs text-fg-subtle">
                {t("confirmationDate")}
                <Input
                  name="at"
                  type="date"
                  defaultValue={at}
                  className="mt-0.5 h-9"
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
              >
                {t("apply")}
              </button>
            </form>
            <PrintButton label={t("print")} />
          </div>
        }
      />
      <Card>
        <CardBody className="space-y-5 text-sm leading-relaxed text-fg">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <div className="font-semibold">{ctx.tenantName}</div>
              <div className="text-fg-muted">{t("confirmationSender")}</div>
            </div>
            <div className="text-right text-fg-muted">{f.date(new Date())}</div>
          </div>
          <div>
            <div className="font-semibold">{v.name}</div>
            {v.address ? (
              <div className="whitespace-pre-line text-fg-muted">
                {v.address}
              </div>
            ) : null}
            {v.taxNumber ? (
              <div className="text-fg-muted">
                {[v.taxOffice, v.taxNumber].filter(Boolean).join(" / ")}
              </div>
            ) : null}
          </div>
          <p className="font-semibold">{t("confirmationSubject")}</p>
          <p>{t("confirmationBody1", { date: atLabel })}</p>
          <p className="rounded-lg bg-surface-sunken p-4 text-center text-base font-semibold">
            {balance === 0
              ? t("confirmationZero", { date: atLabel })
              : balance > 0
                ? t("confirmationWeOwe", {
                    date: atLabel,
                    amount: f.money(balance),
                  })
                : t("confirmationTheyOwe", {
                    date: atLabel,
                    amount: f.money(-balance),
                  })}
          </p>
          <p>{t("confirmationBody2")}</p>
          <div className="grid grid-cols-1 gap-8 pt-4 sm:grid-cols-2 print:grid-cols-2">
            <div className="border-t border-border-strong pt-2">
              <div className="font-semibold">{ctx.tenantName}</div>
              <div className="text-xs text-fg-subtle">
                {t("confirmationManager")}
              </div>
            </div>
            <div className="border-t border-border-strong pt-2">
              <div className="font-semibold">{v.name}</div>
              <div className="text-xs text-fg-subtle">
                {t("confirmationReply")}
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <div>☐ {t("confirmationAgree")}</div>
                <div>☐ {t("confirmationDisagree")}</div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </>
  );
}
