import { CalendarClock, MessageSquare, Vote, Wrench } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { portalSummary } from "@yonetim/contracts";
import {
  Alert, Badge, Card, CardBody, CardHeader, EmptyState, Stat, pageActionClasses,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { formatters } from "@/lib/format";

/**
 * Sakin ana ekranı — `/panel` rol duyarlı olduğu için buraya ayrıldı.
 *
 * NEDEN AYRI BİR EKRAN: yönetim dashboard'u `/v1/panel/dashboard`'dan
 * besleniyor ve o uç `report:read` istiyor; sakinde bu izin yok, olmamalı da
 * (site geneli tahsilat/gider rakamları). Aynı ekrana iki veri kaynağı
 * bağlamak yerine iki ekran var — sorular da zaten farklı: yönetici "sitenin
 * durumu ne", sakin "benim durumum ne" diye soruyor.
 *
 * Ekran tek çağrıdan besleniyor (MIMARI-PLAN §9a).
 */
export async function ResidentHome() {
  const t = await getTranslations("app.resident");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const data = await apiGet("/v1/panel/portal/me", portalSummary);

  // Daire eşleşmemişse borç/ödeme sayıları anlamsız: sakin kaydı yöneticiyle
  // henüz bağlanmamış olabilir. Hata değil, anlatılması gereken bir durum.
  if (!data.unit) {
    return (
      <>
        <PageHeader title={data.tenantName} />
        <EmptyState
          title={t("noUnitTitle")}
          description={t("noUnitDescription")}
          steps={[t("noUnitStep1"), t("noUnitStep2"), t("noUnitStep3")]}
        />
      </>
    );
  }

  const { totals, nextDue } = data;

  return (
    <>
      <PageHeader
        title={t("greeting", { property: data.tenantName })}
        description={`${data.unit.number} · ${tEnum(`ownership.${data.unit.relation}`)}`}
        action={
          <>
            <Link href="/panel/borclarim" className={pageActionClasses.primary}>
              {t("action.viewDebts")}
            </Link>
            <Link href="/panel/taleplerim/yeni" className={pageActionClasses.secondary}>
              <Wrench aria-hidden className="h-4 w-4" />
              {t("action.newRequest")}
            </Link>
          </>
        }
      />

      {totals.overdueMinor > 0 ? (
        <div className="mb-6">
          <Alert tone="danger" title={t("overdueTitle")}>
            {t("overdueBody", { amount: f.money(totals.overdueMinor) })}
          </Alert>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3">
        <Stat
          label={t("currentDebt")}
          value={f.money(totals.outstandingMinor)}
          tone={totals.outstandingMinor > 0 ? "warning" : "success"}
        />
        <Stat
          label={t("overdue")}
          value={f.money(totals.overdueMinor)}
          tone={totals.overdueMinor > 0 ? "danger" : "success"}
        />
        <Stat
          label={t("lastPayment")}
          value={
            totals.lastPaymentMinor === null
              ? t("noPayment")
              : f.money(totals.lastPaymentMinor)
          }
          hint={totals.lastPaymentAt ? f.date(totals.lastPaymentAt) : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t("nextDueTitle")}
            action={
              <Link href="/panel/borclarim" className="text-sm text-primary hover:underline">
                {t("action.all")}
              </Link>
            }
          />
          <CardBody>
            {nextDue ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{nextDue.description}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-subtle">
                    <CalendarClock aria-hidden className="h-4 w-4" />
                    {f.date(nextDue.dueDate)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-heading text-lg font-bold text-fg">
                    {f.money(nextDue.remainingMinor)}
                  </p>
                  {nextDue.overdue ? (
                    <Badge tone="danger">{t("overdueBadge")}</Badge>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-fg-subtle">{t("noOpenDebt")}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("myActivity")} />
          <CardBody className="grid gap-2 sm:grid-cols-3">
            <ActivityTile
              href="/panel/taleplerim"
              icon={<Wrench aria-hidden className="h-4 w-4" />}
              label={t("openRequests")}
              count={data.openRequestCount}
            />
            <ActivityTile
              href="/panel/mesajlarim"
              icon={<MessageSquare aria-hidden className="h-4 w-4" />}
              label={t("unreadMessages")}
              count={data.unreadMessageCount}
            />
            {/*
              Oylama ekranı sakin tarafında henüz yok (PROJE-DURUMU §5.8
              "sırada"): sayı gösteriliyor ama bağlantı verilmiyor —
              tıklayınca yönetim anket ekranına düşmek, olmayan bir özelliği
              varmış gibi göstermekten daha kötü.
            */}
            <ActivityTile
              icon={<Vote aria-hidden className="h-4 w-4" />}
              label={t("openPolls")}
              count={data.openPollCount}
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={t("announcementsTitle")}
          action={
            <Link href="/panel/duyurular" className="text-sm text-primary hover:underline">
              {t("action.all")}
            </Link>
          }
        />
        <CardBody className="space-y-3">
          {data.announcements.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("noAnnouncements")}</p>
          ) : (
            data.announcements.map((a) => (
              <article key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-fg">{a.title}</h3>
                  {a.urgent ? <Badge tone="danger">{t("urgent")}</Badge> : null}
                  {a.publishedAt ? (
                    <span className="ml-auto text-xs text-fg-subtle">
                      {f.date(a.publishedAt)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-fg-muted">
                  {a.body}
                </p>
              </article>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}

/** Sayı sıfırsa da gösteriliyor: "hiç talebim yok" da bir cevap. */
function ActivityTile({
  href,
  icon,
  label,
  count,
}: {
  /** Verilmezse kutu bağlantı değil — gidilecek bir ekran yoksa link olmamalı. */
  href?: string;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
        {icon}
        {label}
      </span>
      <span className="mt-1 block font-heading text-2xl font-bold text-fg">{count}</span>
    </>
  );
  const className = "rounded-lg border border-border p-3";

  return href ? (
    <Link href={href} className={`${className} transition-colors hover:bg-hover`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
