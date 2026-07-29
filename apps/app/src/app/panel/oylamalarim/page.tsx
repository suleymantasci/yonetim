import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { portalPollsResponse, type PortalPollRow } from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { VoteForm } from "./vote-form";

/**
 * "Oylamalarım" — sakinin oy kullandığı ekran.
 *
 * NEDEN `/panel/anketler` DEĞİL: o ekran yönetimin ve anket **açıp
 * kapatıyor** (`poll:write`); sakinde o izin yok, olmamalı da. Sakin ana
 * ekranında "oy bekleyen anket" sayısı gösteriliyordu ama bağlantı yoktu —
 * sayıyı gösterip gidilecek yer vermemek, olmayan bir özelliği varmış gibi
 * göstermekten farksızdı (PROJE-DURUMU §5.8.7).
 *
 * Açık oylamanın **ara sonucu gösterilmiyor**; uç zaten döndürmüyor. Sonuç
 * yalnız kapandıktan sonra: önde giden seçeneği göstermek, sonradan oy
 * verecekleri etkilerdi.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.myPolls");
  return { title: t("title") };
}

export default async function MyPollsPage() {
  await requirePermission("poll:vote");
  const t = await getTranslations("app.myPolls");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const { rows } = await apiGet("/v1/panel/portal/polls", portalPollsResponse);

  const open = rows.filter((poll) => poll.isOpen);
  const closed = rows.filter((poll) => !poll.isOpen);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : null}

      <div className="mx-auto max-w-3xl space-y-4">
        {open.map((poll) => (
          <Card key={poll.id}>
            <CardHeader
              title={poll.question}
              description={poll.description ?? undefined}
              action={
                <span className="text-xs text-fg-subtle">
                  {t("closesAt", { date: f.dateTime(poll.closesAt) })}
                </span>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="info">{tEnum(`pollWeight.${poll.weightMode}`)}</Badge>
                {poll.ownersOnly ? (
                  <Badge tone="neutral">{t("ownersOnlyBadge")}</Badge>
                ) : null}
                {poll.visibility === "secret" ? (
                  <Badge tone="neutral">{t("secretBadge")}</Badge>
                ) : null}
              </div>

              {poll.canVote ? (
                <VoteForm
                  pollId={poll.id}
                  options={poll.options}
                  allowMultiple={poll.allowMultiple}
                  submitLabel={t("castVote")}
                  hint={poll.allowMultiple ? t("multipleHint") : t("singleHint")}
                />
              ) : (
                /*
                 * Oy kullanılamıyorsa **sebebi** yazılıyor. Formu gizleyip
                 * susmak sakine "sistem beni tanımadı mı" dedirtir; kiracıya
                 * "yalnız malikler oy kullanabilir" (KMK md.31) demek ile
                 * "oyunuzu zaten kullandınız" demek arasındaki fark,
                 * yöneticiyi aramakla aramamak kadar.
                 */
                <Alert
                  tone={poll.blockedReason === "already_voted" ? "success" : "info"}
                >
                  {poll.blockedReason === "already_voted"
                    ? t("youVoted", { option: labelsOf(poll).join(", ") })
                    : t(`blocked.${poll.blockedReason ?? "not_open"}`)}
                </Alert>
              )}
            </CardBody>
          </Card>
        ))}

        {closed.length > 0 ? (
          <Card>
            <CardHeader title={t("closedTitle")} description={t("closedDescription")} />
            <CardBody className="space-y-3">
              {closed.map((poll) => (
                <article key={poll.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <h3 className="font-medium text-fg">{poll.question}</h3>
                    <span className="ml-auto text-xs text-fg-subtle">
                      {f.date(poll.closedAt ?? poll.closesAt)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <PollResult poll={poll} noResultLabel={t("noResultYet")} />
                  </div>
                  {poll.myVote.length > 0 ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-success-fg">
                      <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
                      {t("youVoted", {
                        option: labelsOf(poll).join(", "),
                      })}
                    </p>
                  ) : null}
                </article>
              ))}
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}

/** Sakinin verdiği oyların **etiketleri** — ekranda `opt2` yazamayız. */
function labelsOf(poll: PortalPollRow): string[] {
  return poll.myVote.map(
    (id) => poll.options.find((option) => option.id === id)?.label ?? id,
  );
}

/**
 * Kapanmış oylamanın saklanmış sonucu.
 *
 * Sonuç kapatma anında hesaplanıp `result_json`'a yazılıyor; burada yeniden
 * hesaplanmıyor. Arsa payları sonradan değişirse geçmiş bir kararın sonucu
 * değişmemeli.
 */
function PollResult({
  poll,
  noResultLabel,
}: {
  poll: PortalPollRow;
  noResultLabel: string;
}) {
  const result = poll.result as
    | { options?: { id: string; label: string; votes: number; pct: number }[] }
    | null;
  const options = result?.options ?? [];

  if (options.length === 0) {
    return <p className="text-sm text-fg-subtle">{noResultLabel}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {options.map((option) => (
        <li key={option.id}>
          <div className="flex justify-between text-sm">
            <span className="text-fg-muted">{option.label}</span>
            <span className="tabular-nums text-fg">{option.pct}%</span>
          </div>
          {/* Çubuk yüzdeyi tekrar ediyor, tek başına taşımıyor: ekran
              okuyucu ve renk körü kullanıcı için sayı zaten yanında. */}
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, option.pct))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
