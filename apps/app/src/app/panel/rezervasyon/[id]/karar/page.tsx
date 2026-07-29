import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { reservationListResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { ReservationDecisionForm } from "../../decision-form";

export const dynamic = "force-dynamic";

/**
 * `/panel/rezervasyon/[id]/karar` — tam sayfa (çekmece: `@modal`).
 *
 * Rezervasyonun ayrı bir detay ucu **yok**: liste zaten tüm alanları
 * taşıyor ve tek kayıt için ikinci bir uç açmak, aynı veriyi iki yerde
 * biçimlendirmek olurdu. Kayıt listeden bulunuyor.
 */
export default async function ReservationDecisionPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission("reservation:approve");
  const t = await getTranslations("app.reservations");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const { rows, resources } = await apiGet(
    "/v1/panel/operations/reservations",
    reservationListResponse,
  );
  const row = rows.find((r) => r.id === id);
  if (!row) notFound();

  const resource = resources.find((r) => r.id === row.resourceId);

  return (
    <>
      <PageHeader
        title={t("decideTitle")}
        description={t("decideDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/rezervasyon" },
          { label: t("decideTitle") },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={resource?.name ?? row.resourceName ?? "—"}
            action={
              <Badge tone={row.status === "pending" ? "warning" : "neutral"}>
                {tEnum(`reservationStatus.${row.status}`)}
              </Badge>
            }
          />
          <CardBody className="space-y-2 text-sm">
            <Row label={t("startAt")} value={f.dateTime(row.startAt)} />
            <Row label={t("endAt")} value={f.dateTime(row.endAt)} />
            <Row label={t("unit")} value={row.unitNumber ?? t("unitNone")} />
            <Row label={t("guestCount")} value={String(row.guestCount)} />
            <Row label={t("fee")} value={f.money(row.feeMinor)} />
            {row.note ? (
              <p className="whitespace-pre-wrap border-t border-border pt-2 text-fg">
                {row.note}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("decision")} />
          <CardBody>
            <ReservationDecisionForm
              reservationId={row.id}
              currentStatus={row.status}
              submitLabel={tCommon("action.save")}
            />
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
