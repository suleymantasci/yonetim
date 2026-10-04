import { MessageSquare, Send } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { messageListResponse } from "@yonetim/contracts";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Stat,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * `/panel/mesajlar` — gelen kutusu.
 *
 * NEDEN MESAJ DEĞİL KONUŞMA LİSTESİ: ekran önce düz bir mesaj kütüğüydü.
 * Aynı sakinin beş mesajı beş ayrı satırdı, hiçbirinde kimin yazdığı
 * görünmüyordu ve cevaplamanın yolu yoktu — yani gelen kutusu olmayan bir
 * gelen kutusuydu. Şimdi her satır bir muhatap; tıklayınca yazışma açılıyor
 * ve cevap oradan yazılıyor.
 */
export default async function MessagesPage() {
  const ctx = await requirePermission("message:read");
  const t = await getTranslations("app.messages");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { threads, totals } = await apiGet(
    "/v1/panel/communication/messages",
    messageListResponse,
  );
  const botRate = totals.botRatePct / 100;
  const canWrite = hasPermission(ctx.roles, "message:write");

  const newMessageButton = canWrite ? (
    <Link
      href="/panel/mesajlar/yeni"
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
    >
      <Send aria-hidden className="h-4 w-4" />
      {t("newMessage")}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={newMessageButton}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t("inbound")} value={String(totals.inbound)} />
        <Stat
          label={t("awaitingReply")}
          value={String(totals.awaitingReply)}
          tone={totals.awaitingReply ? "warning" : "success"}
        />
        <Stat
          label={t("botRate")}
          value={f.percent(botRate)}
          tone={botRate >= 0.9 ? "success" : "warning"}
        />
        <Stat
          label={t("needsHuman")}
          value={String(totals.needsHuman)}
          tone={totals.needsHuman ? "warning" : "success"}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title={t("threads")} />
        <CardBody className="p-0">
          {threads.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
                action={newMessageButton ?? undefined}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {threads.map((thread) => {
                const { correspondent: who } = thread;
                const name = who.name ?? who.phoneMasked ?? t("unmatched");

                const body = (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fg">{name}</span>
                      {who.unitLabel ? (
                        <span className="text-xs text-fg-subtle">
                          {who.unitLabel}
                        </span>
                      ) : null}
                      <Badge tone="neutral">
                        {tEnum(`channel.${thread.channel}`)}
                      </Badge>
                      {thread.awaitingReply ? (
                        <Badge tone="warning">{t("awaitingReplyBadge")}</Badge>
                      ) : null}
                      <span className="ml-auto text-xs text-fg-subtle">
                        {f.dateTime(thread.lastAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-fg-muted">
                      {/*
                        Son mesajın yönü metnin önüne yazılıyor: "Siz:" olmadan
                        yönetici kendi yazdığını sakinin yazdığı sanabilir.
                      */}
                      {thread.lastDirection === "out" ? (
                        <span className="text-fg-subtle">{t("youPrefix")} </span>
                      ) : null}
                      {thread.lastBody ?? ""}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-subtle">
                      <MessageSquare aria-hidden className="h-3.5 w-3.5" />
                      {t("messageCount", { count: thread.messageCount })}
                    </p>
                  </>
                );

                /*
                 * Eşleşmemiş numara bir sakin kaydına bağlı değil: mesaj
                 * gönderilecek bir `userId` yok, dolayısıyla satır da bağlantı
                 * değil. Tıklanıp boş bir yazışma açmak, "cevaplayabilirsin"
                 * demenin yanlış yolu olurdu.
                 */
                return (
                  <li key={who.id ?? "unmatched"}>
                    {who.id ? (
                      <Link
                        href={`/panel/mesajlar/${who.id}`}
                        className="block px-4 py-3 transition-colors hover:bg-hover"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">
                        {body}
                        <p className="mt-1 text-xs text-fg-subtle">
                          {t("unmatchedHint")}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
