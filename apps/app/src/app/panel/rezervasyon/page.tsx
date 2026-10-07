import { Ban, CalendarPlus, Pencil, Plus } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { reservationListResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, EmptyState, Textarea } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import { FormField } from "@/components/form/action-form";
import { cancelOwnReservation } from "./actions";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  approved: "success",
  pending: "warning",
  rejected: "danger",
  cancelled: "neutral",
  completed: "neutral",
  no_show: "danger",
};

export default async function ReservationsPage() {
  const ctx = await requirePermission("reservation:read");
  const t = await getTranslations("app.reservations");
  const tEnum = await getTranslations("enum");
  const tCommon = await getTranslations("common");
  const f = await formatters();

  const { resources: res, rows } = await apiGet(
    "/v1/panel/operations/reservations",
    reservationListResponse,
  );

  const canWrite = hasPermission(ctx.roles, "reservation:write");
  const canApprove = hasPermission(ctx.roles, "reservation:approve");

  /*
   * Tesis hiç tanımlanmamışsa birincil eylem **tesis tanımlamak**, rezervasyon
   * almak değil: rezervasyon formu boş bir listeyle açılır ve kullanıcıyı
   * çıkmaza sokardı.
   */
  const primaryAction = !canWrite ? null : res.length === 0 ? (
    <Link
      href="/panel/rezervasyon/tesis/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {t("newResource")}
    </Link>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/panel/rezervasyon/yeni"
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
      >
        <CalendarPlus aria-hidden className="h-4 w-4" />
        {t("newReservation")}
      </Link>
      <Link
        href="/panel/rezervasyon/tesis/yeni"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-fg hover:bg-hover"
      >
        <Plus aria-hidden className="h-4 w-4" />
        {t("newResource")}
      </Link>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={primaryAction}
      />

      {res.length === 0 ? (
        <EmptyState
          title={t("noResourcesTitle")}
          description={t("noResourcesDescription")}
          action={primaryAction ?? undefined}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {res.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={r.name}
              description={`${
                tEnum.has(`resourceKind.${r.kind}`)
                  ? tEnum(`resourceKind.${r.kind}`)
                  : r.kind
              } · ${t("capacity", { value: r.capacity ?? "—" })}`}
              action={
                canWrite ? (
                  <Link
                    href={`/panel/rezervasyon/tesis/${r.id}/duzenle`}
                    aria-label={tCommon("action.edit")}
                    className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                  >
                    <Pencil aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                ) : undefined
              }
            />
            <CardBody className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-fg-subtle">{t("fee")}</span>
                <span className="font-medium text-fg">
                  {r.feeMinor === 0
                    ? t("free")
                    : `${f.money(r.feeMinor)} / ${tEnum(`feeUnit.${r.feeUnit}`)}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">{t("deposit")}</span>
                <span>
                  {r.depositMinor === 0
                    ? t("noDeposit")
                    : f.money(r.depositMinor)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">{t("approval")}</span>
                <span>
                  {r.requiresApproval
                    ? t("approvalRequired")
                    : t("autoApproval")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-subtle">{t("hours")}</span>
                <span className="tabular-nums">
                  {r.openHour}:00 – {r.closeHour}:00
                </span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title={t("listTitle")} />
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
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-fg">
                      {/* Kaynak adı sunucuda join'lendi; istemcide arama yok. */}
                      {r.resourceName ?? "—"}
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {f.dateTime(r.startAt)} → {f.dateTime(r.endAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                      {tEnum(`reservationStatus.${r.status}`)}
                    </Badge>
                    <span className="tabular-nums">{f.money(r.feeMinor)}</span>
                    {canApprove ? (
                      <Link
                        href={`/panel/rezervasyon/${r.id}/karar`}
                        className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-fg hover:bg-hover"
                      >
                        {t("decide")}
                      </Link>
                    ) : r.isMine &&
                      (r.status === "pending" || r.status === "approved") &&
                      r.startAt.getTime() > Date.now() ? (
                      <ActionDrawerButton
                        action={cancelOwnReservation}
                        hidden={{ id: r.id }}
                        icon={Ban}
                        tone="danger"
                        label={t("cancelOwn")}
                        title={t("cancelOwnTitle")}
                        description={`${r.resourceName ?? ""} · ${f.dateTime(r.startAt)}`}
                        warning={r.feeMinor > 0 ? t("cancelOwnFeeNote") : undefined}
                        submitLabel={t("cancelOwnConfirm")}
                      >
                        <FormField name="reason" label={t("cancelOwnReason")} required>
                          <Textarea name="reason" rows={2} minLength={3} maxLength={500} required />
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
    </>
  );
}
