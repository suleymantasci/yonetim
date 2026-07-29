import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { portalRequestDetail } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";
import { Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { CommentForm } from "../comment-form";

/**
 * Talep detayı ve yönetimle yazışma.
 *
 * Başkasının talebine gidilirse uç 404 döndürüyor (403 değil): 403 dönmek
 * "böyle bir kayıt var ama senin değil" bilgisini sızdırırdı.
 */
export const dynamic = "force-dynamic";

const CLOSED = new Set(["resolved", "closed", "rejected"]);

export default async function MyRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("request:read_own");
  const { id } = await params;
  const t = await getTranslations("app.myRequests");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const request = await apiGet(
    `/v1/panel/portal/requests/${id}`,
    portalRequestDetail,
  ).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "not_found") notFound();
    throw error;
  });

  return (
    <>
      <PageHeader
        title={request.title}
        description={`${request.code} · ${tEnum(`requestCategory.${request.category}`)}`}
        breadcrumb={[
          { href: "/panel/taleplerim", label: t("title") },
          { label: request.code },
        ]}
        meta={
          <Badge tone={CLOSED.has(request.status) ? "success" : "info"}>
            {tEnum(`requestStatus.${request.status}`)}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={t("conversation")} description={t("conversationHint")} />
            <CardBody className="space-y-3">
              {request.description ? (
                <Bubble
                  mine
                  body={request.description}
                  meta={f.dateTime(request.createdAt)}
                  label={t("originalRequest")}
                />
              ) : null}

              {request.comments.map((c) => (
                <Bubble
                  key={c.id}
                  mine={c.mine}
                  body={c.body}
                  meta={f.dateTime(c.createdAt)}
                  label={c.mine ? undefined : (c.authorName ?? t("management"))}
                />
              ))}

              {request.comments.length === 0 && !request.description ? (
                <p className="text-sm text-fg-subtle">{t("noComments")}</p>
              ) : null}
            </CardBody>
          </Card>

          {/*
            Kapanmış talebe yorum kutusu gösterilmiyor: uç zaten kabul ederdi
            ama "yazdım, kimse görmedi" hissi kapanmış bir kaydın en kötü
            hâli. Kullanıcı yeni talep açmaya yönlendiriliyor.
          */}
          {CLOSED.has(request.status) ? (
            <p className="mt-3 text-sm text-fg-subtle">{t("closedHint")}</p>
          ) : (
            <Card className="mt-4">
              <CardBody>
                <CommentForm requestId={request.id} />
              </CardBody>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader title={t("details")} />
          <CardBody className="space-y-3 text-sm">
            <Row label={t("col.status")} value={tEnum(`requestStatus.${request.status}`)} />
            <Row
              label={t("field.priority")}
              value={tEnum(`requestPriority.${request.priority}`)}
            />
            <Row label={t("col.createdAt")} value={f.dateTime(request.createdAt)} />
            {request.resolvedAt ? (
              <Row label={t("resolvedAt")} value={f.dateTime(request.resolvedAt)} />
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-right font-medium text-fg">{value}</dd>
    </div>
  );
}

/** Yön farkı renkle değil hizayla da veriliyor — renk körlüğü tek ipucu bırakmamalı. */
function Bubble({
  mine,
  body,
  meta,
  label,
}: {
  mine: boolean;
  body: string;
  meta: string;
  label?: string;
}) {
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          mine
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-primary-fg"
            : "max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-sunken px-3.5 py-2.5 text-fg"
        }
      >
        {label ? (
          <p className={mine ? "text-xs opacity-80" : "text-xs text-fg-subtle"}>{label}</p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
        <p className={mine ? "mt-1 text-[11px] opacity-70" : "mt-1 text-[11px] text-fg-subtle"}>
          {meta}
        </p>
      </div>
    </div>
  );
}
