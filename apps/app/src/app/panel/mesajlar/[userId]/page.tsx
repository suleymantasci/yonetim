import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { messageThreadDetail } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { MessageForm } from "../message-form";

/**
 * Tek sakinle yazışma ve cevap kutusu.
 *
 * Cevap formu listede değil burada: gelen kutusunda her satıra kutu koymak
 * yanlış kişiye yazmayı kolaylaştırırdı. Bu ekranda muhatap tek ve sabit —
 * alıcı seçimi yok, `userId` gizli alandan gidiyor.
 */
export const dynamic = "force-dynamic";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const ctx = await requirePermission("message:read");
  const { userId } = await params;
  const t = await getTranslations("app.messages");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const thread = await apiGet(
    `/v1/panel/communication/messages/${userId}`,
    messageThreadDetail,
  ).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  });

  const who = thread.correspondent;
  const name = who.name ?? who.phoneMasked ?? t("unmatched");

  return (
    <>
      <PageHeader
        title={name}
        description={[who.unitLabel, who.phoneMasked]
          .filter(Boolean)
          .join(" · ")}
        breadcrumb={[
          { href: "/panel/mesajlar", label: t("title") },
          { label: name },
        ]}
      />

      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardHeader title={t("conversation")} />
          <CardBody className="space-y-3">
            {thread.rows.length === 0 ? (
              <EmptyState
                title={t("threadEmptyTitle")}
                description={t("threadEmptyDescription")}
              />
            ) : (
              thread.rows.map((m) => {
                // `out` = yönetimden sakine; yöneticinin kendi mesajı sağda.
                const mine = m.direction === "out";
                return (
                  <div
                    key={m.id}
                    className={mine ? "flex justify-end" : "flex justify-start"}
                  >
                    <div
                      className={
                        mine
                          ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-primary-fg"
                          : "max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-sunken px-3.5 py-2.5 text-fg"
                      }
                    >
                      {!mine ? (
                        <p className="text-xs text-fg-subtle">{name}</p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {m.body ?? ""}
                      </p>
                      <p
                        className={
                          mine
                            ? "mt-1 flex items-center gap-2 text-[11px] opacity-70"
                            : "mt-1 flex items-center gap-2 text-[11px] text-fg-subtle"
                        }
                      >
                        {f.dateTime(m.createdAt)}
                        <span>{tEnum(`channel.${m.channel}`)}</span>
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        {hasPermission(ctx.roles, "message:write") ? (
          <Card>
            <CardBody>
              <MessageForm
                recipient={{ id: userId, name }}
                submitLabel={t("reply")}
              />
            </CardBody>
          </Card>
        ) : (
          <Badge tone="neutral">{t("replyNoPermission")}</Badge>
        )}
      </div>
    </>
  );
}
