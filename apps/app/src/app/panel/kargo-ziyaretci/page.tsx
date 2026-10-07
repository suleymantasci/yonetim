import { getTranslations } from "next-intl/server";
import { LogOut, PackageCheck, PackagePlus, UserPlus } from "lucide-react";

import { hasPermission } from "@yonetim/auth/guard";
import { frontdeskResponse, unitOptionList } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, Input, Select, Stat, Textarea } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import { FormField } from "@/components/form/action-form";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { checkoutVisitor, deliverParcel, receiveParcel, registerVisitor } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Kargo ve ziyaretçi defteri — kapıcı/güvenliğin ekranı. Bekleyen kargo ve
 * içerideki ziyaretçi üstte; kayıt kartlarla (telefonda okunur, tablo yok).
 */
export default async function FrontdeskPage() {
  const ctx = await requirePermission("frontdesk:read");
  const t = await getTranslations("app.frontdesk");
  const tCommon = await getTranslations("common");
  const f = await formatters();
  const canWrite = hasPermission(ctx.roles, "frontdesk:write");

  const [data, units] = await Promise.all([
    apiGet("/v1/panel/frontdesk", frontdeskResponse),
    apiGet("/v1/panel/units/options", unitOptionList).catch(() => []),
  ]);
  const unitSelect = (
    <FormField name="unitId" label={t("unit")} hint={t("unitHint")}>
      <Select name="unitId" defaultValue="">
        <option value="">{t("unitNone")}</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.blockName ? `${u.blockName} / ${u.number}` : u.number}
          </option>
        ))}
      </Select>
    </FormField>
  );

  const waiting = data.parcels.filter((p) => !p.deliveredAt);
  const delivered = data.parcels.filter((p) => p.deliveredAt);
  const inside = data.visitors.filter((v) => !v.leftAt);
  const left = data.visitors.filter((v) => v.leftAt);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("waitingParcels")} value={String(data.totals.waitingParcels)} tone={data.totals.waitingParcels > 0 ? "warning" : "neutral"} />
        <Stat label={t("visitorsInside")} value={String(data.totals.visitorsInside)} />
        <Stat label={t("visitorsToday")} value={String(data.totals.visitorsToday)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("parcelsTitle")}
            description={t("parcelsHint")}
            action={
              canWrite ? (
                <ActionDrawerButton
                  action={receiveParcel}
                  hidden={{}}
                  icon={<PackagePlus />}
                  label={t("receiveParcel")}
                  title={t("receiveParcel")}
                  description={t("receiveParcelHint")}
                  submitLabel={tCommon("action.save")}
                >
                  {unitSelect}
                  <FormField name="recipientName" label={t("recipientName")} required>
                    <Input name="recipientName" minLength={2} maxLength={160} required />
                  </FormField>
                  <FormField name="carrier" label={t("carrier")}>
                    <Input name="carrier" maxLength={60} placeholder={t("carrierPlaceholder")} />
                  </FormField>
                  <FormField name="trackingNo" label={t("trackingNo")}>
                    <Input name="trackingNo" maxLength={80} />
                  </FormField>
                  <FormField name="note" label={t("note")}>
                    <Textarea name="note" rows={2} maxLength={1000} />
                  </FormField>
                </ActionDrawerButton>
              ) : undefined
            }
          />
          <CardBody className="p-0">
            {data.parcels.length === 0 ? (
              <p className="p-4 text-sm text-fg-muted">{t("parcelsEmpty")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {[...waiting, ...delivered].map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-fg [overflow-wrap:anywhere]">
                        {p.recipientName}
                        {p.unitLabel ? <span className="ml-2 text-xs font-normal text-fg-subtle">{p.unitLabel}</span> : null}
                      </div>
                      <div className="text-xs text-fg-subtle">
                        {[p.carrier, p.trackingNo, f.dateTime(p.receivedAt)].filter(Boolean).join(" · ")}
                      </div>
                      {p.deliveredAt ? (
                        <div className="text-xs text-fg-muted">
                          {t("deliveredLine", { to: p.deliveredTo ?? "—", at: f.dateTime(p.deliveredAt) })}
                        </div>
                      ) : null}
                    </div>
                    {p.deliveredAt ? (
                      <Badge tone="success">{t("delivered")}</Badge>
                    ) : canWrite ? (
                      <ActionDrawerButton
                        action={deliverParcel}
                        hidden={{ id: p.id }}
                        icon={<PackageCheck />}
                        label={t("deliver")}
                        title={t("deliver")}
                        description={`${p.recipientName}${p.unitLabel ? ` · ${p.unitLabel}` : ""}`}
                        submitLabel={t("deliver")}
                      >
                        <FormField name="deliveredTo" label={t("deliveredTo")} required>
                          <Input name="deliveredTo" defaultValue={p.recipientName} minLength={2} maxLength={160} required />
                        </FormField>
                      </ActionDrawerButton>
                    ) : (
                      <Badge tone="warning">{t("waiting")}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("visitorsTitle")}
            description={t("visitorsHint")}
            action={
              canWrite ? (
                <ActionDrawerButton
                  action={registerVisitor}
                  hidden={{}}
                  icon={<UserPlus />}
                  label={t("registerVisitor")}
                  title={t("registerVisitor")}
                  description={t("registerVisitorHint")}
                  submitLabel={tCommon("action.save")}
                >
                  <FormField name="visitorName" label={t("visitorName")} required>
                    <Input name="visitorName" minLength={2} maxLength={160} required />
                  </FormField>
                  {unitSelect}
                  <FormField name="purpose" label={t("purpose")}>
                    <Input name="purpose" maxLength={120} placeholder={t("purposePlaceholder")} />
                  </FormField>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField name="phone" label={t("phone")}>
                      <Input name="phone" type="tel" maxLength={20} />
                    </FormField>
                    <FormField name="plate" label={t("plate")}>
                      <Input name="plate" maxLength={20} />
                    </FormField>
                  </div>
                  <FormField name="note" label={t("note")}>
                    <Textarea name="note" rows={2} maxLength={1000} />
                  </FormField>
                </ActionDrawerButton>
              ) : undefined
            }
          />
          <CardBody className="p-0">
            {data.visitors.length === 0 ? (
              <p className="p-4 text-sm text-fg-muted">{t("visitorsEmpty")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {[...inside, ...left].map((v) => (
                  <li key={v.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-fg [overflow-wrap:anywhere]">
                        {v.visitorName}
                        {v.unitLabel ? <span className="ml-2 text-xs font-normal text-fg-subtle">→ {v.unitLabel}</span> : null}
                      </div>
                      <div className="text-xs text-fg-subtle">
                        {[v.purpose, v.plate, f.dateTime(v.arrivedAt)].filter(Boolean).join(" · ")}
                      </div>
                      {v.leftAt ? (
                        <div className="text-xs text-fg-muted">{t("leftLine", { at: f.dateTime(v.leftAt) })}</div>
                      ) : null}
                    </div>
                    {v.leftAt ? (
                      <Badge tone="neutral">{t("left")}</Badge>
                    ) : canWrite ? (
                      <ActionDrawerButton
                        action={checkoutVisitor}
                        hidden={{ id: v.id }}
                        icon={<LogOut />}
                        label={t("checkout")}
                        title={t("checkout")}
                        description={v.visitorName}
                        submitLabel={t("checkout")}
                      />
                    ) : (
                      <Badge tone="info">{t("inside")}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
