import { getTranslations } from "next-intl/server";

import { accessRequestListResponse, unitOptionList } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { DecisionCard } from "./decision-card";

/**
 * `/panel/sakinler/talepler` — erişim talebi onay kuyruğu.
 *
 * NEDEN YENİ EKRAN: uç (`GET/POST /v1/panel/residents/access-requests…`) ve
 * onay mantığı aylardır vardı, **gidilecek yer** yoktu. `/kayit-talebi`'nden
 * başvuran kişi "yönetim onaylayınca giriş yapabilirsiniz" ekranında kalıyor,
 * yönetici ise başvurudan hiç haberdar olmuyordu. Kuyruğu görünür kılmadan
 * nav rozeti eklemek, sayıyı gösterip gidilecek yer vermemek olurdu
 * (PROJE-DURUMU §5.8.7).
 *
 * KARAR VERİLMİŞ TALEPLER DE LİSTELENİYOR: "bu başvuruyu kim, ne zaman
 * reddetti" sorusunun cevabı ekranda olmalı. Denetim kütüğünde var ama
 * yöneticinin gideceği yer orası değil.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.accessRequests");
  return { title: t("title") };
}

export default async function AccessRequestsPage() {
  await requirePermission("resident:invite");
  const t = await getTranslations("app.accessRequests");
  const f = await formatters();

  const [list, units] = await Promise.all([
    apiGet("/v1/panel/residents/access-requests", accessRequestListResponse),
    apiGet("/v1/panel/units/options", unitOptionList),
  ]);

  const pending = list.rows.filter((row) => row.status === "pending");
  const decided = list.rows.filter((row) => row.status !== "pending");

  const unitOptions = units.map((unit) => ({
    id: unit.id,
    number: unit.number,
    blockName: unit.blockName,
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[
          { label: t("residents"), href: "/panel/sakinler" },
          { label: t("title") },
        ]}
      />

      {pending.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="space-y-4">
          {pending.map((row) => (
            <Card key={row.id}>
              <CardHeader
                title={row.fullName}
                description={t("claimLine", {
                  unit: [row.blockLabel, row.unitLabel].filter(Boolean).join(" · "),
                  relation:
                    row.claimedRelation === "owner"
                      ? t("relationOwner")
                      : t("relationTenant"),
                })}
                action={
                  <span className="text-xs text-fg-subtle">
                    {f.dateTime(row.createdAt)}
                  </span>
                }
              />
              <CardBody>
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <Row label={t("phone")} value={row.phoneMasked} />
                  {row.email ? <Row label={t("email")} value={row.email} /> : null}
                </dl>

                {row.note ? (
                  <p className="mt-2 rounded-lg bg-surface-sunken p-3 text-sm text-fg-muted">
                    {row.note}
                  </p>
                ) : null}

                {/*
                  Eşleşme bulunduysa söyleniyor, bulunmadıysa da: "beyan edilen
                  daire listede yok" yöneticinin bakması gereken bir işaret —
                  sessiz kalmak onu numarayı doğru sanmaya bırakırdı.
                */}
                <p className="mt-2 text-xs">
                  {row.matchedUnit ? (
                    <Badge tone="info">
                      {t("matchFound", { unit: row.matchedUnit.number })}
                    </Badge>
                  ) : (
                    <Badge tone="warning">{t("matchMissing")}</Badge>
                  )}
                </p>

                <DecisionCard
                  requestId={row.id}
                  units={unitOptions}
                  suggestedUnitId={row.matchedUnit?.id ?? null}
                  claimedRelation={row.claimedRelation}
                />
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {decided.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title={t("decidedTitle")} description={t("decidedDescription")} />
          <CardBody className="p-0">
            <ul className="divide-y divide-border">
              {decided.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <span className="font-medium text-fg">{row.fullName}</span>
                  <span className="text-xs text-fg-subtle">{row.unitLabel}</span>
                  <Badge tone={row.status === "approved" ? "success" : "neutral"}>
                    {row.status === "approved" ? t("statusApproved") : t("statusRejected")}
                  </Badge>
                  <span className="ml-auto text-xs text-fg-subtle">
                    {f.dateTime(row.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}
