import { getTranslations } from "next-intl/server";

import { announcementListResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { AnnouncementComposer } from "@/components/announcement-composer";
import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

import { AnnouncementRowActions } from "./row-actions";

export const dynamic = "force-dynamic";

/**
 * Duyurular — yönetim ve sakin **aynı** ekranı paylaşıyor.
 *
 * Duyuru tanımı gereği site geneline yayın: içerik iki taraf için de aynı,
 * değişen yalnız yazma yetkisi. Ayrı bir sakin rotası açmak aynı listeyi
 * ikinci kez yazmak olurdu. Besteci kutusu `announcement:write` ile
 * gizleniyor — öncesinde herkese render ediliyordu ve sakin, gönderemeyeceği
 * bir formu görüyordu.
 */
export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ duzenle?: string }>;
}) {
  const { duzenle } = await searchParams;
  const ctx = await requirePermission("announcement:read");
  const canCompose = can(ctx, "announcement:write");
  const t = await getTranslations("app.announcements");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { rows } = await apiGet(
    "/v1/panel/communication/announcements",
    announcementListResponse,
  );
  // `?duzenle=<id>`: yalnız taslak düzenlenebilir; yayımlanmışsa yok sayılır.
  const editing = canCompose ? rows.find((r) => r.id === duzenle && !r.publishedAt) : undefined;
  const now = Date.now();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className={canCompose ? "grid gap-4 lg:grid-cols-2" : "mx-auto max-w-3xl"}>
        {/*
          Acil kutusu ayrı yetkiye bağlı: işaretlendiğinde sakinin kanal
          tercihi geçersiz kalıyor ve WhatsApp/SMS/e-posta/uygulama içi
          bildirimin hepsi açılıyor. Yetkisi olmayana gösterilmiyor —
          sunucu da ayrıca reddediyor, ekran yalnız boşa doldurulacak bir
          kutuyu göstermiyor.
        */}
        {canCompose ? (
          <AnnouncementComposer
            canSendUrgent={can(ctx, "announcement:send_urgent")}
            draft={
              editing
                ? {
                    id: editing.id,
                    title: editing.title,
                    body: editing.body,
                    audience: editing.audience,
                    channels: editing.channels,
                    isUrgent: editing.isUrgent,
                  }
                : undefined
            }
          />
        ) : null}

        <Card>
          <CardHeader
            title={t("publishedTitle")}
            description={tCommon("unit.record", { count: rows.length })}
          />
          <CardBody className="space-y-3">
            {rows.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("noAnnouncements")}</p>
            ) : (
              rows.map((a) => (
                <article
                  key={a.id}
                  className="rounded border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-fg">{a.title}</h3>
                    {a.isUrgent ? (
                      <Badge tone="danger">{t("urgentBadge")}</Badge>
                    ) : null}
                    {a.kvkkFlagged ? (
                      <Badge tone="warning">{t("kvkkBadge")}</Badge>
                    ) : null}
                    <Badge tone="neutral">
                      {tEnum(`audience.${a.audience}`)}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm text-fg-muted">
                    {a.body}
                  </p>
                  <div className="mt-2 text-xs text-fg-subtle">
                    {a.publishedAt ? f.dateTime(a.publishedAt) : t("draft")} ·{" "}
                    {a.channels.map((c) => tEnum(`channel.${c}`)).join(", ")}
                    {a.expiresAt && a.expiresAt.getTime() <= now ? (
                      <> · {t("withdrawnOn", { date: f.dateTime(a.expiresAt) })}</>
                    ) : null}
                  </div>
                  {canCompose ? (
                    <AnnouncementRowActions
                      id={a.id}
                      published={Boolean(a.publishedAt)}
                      withdrawn={Boolean(a.expiresAt && a.expiresAt.getTime() <= now)}
                    />
                  ) : null}
                </article>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
