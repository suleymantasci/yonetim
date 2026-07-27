import { getTranslations } from "next-intl/server";

import { pollListResponse } from "@yonetim/contracts";
import { QUORUM_RULES, type QuorumRule } from "@yonetim/dues";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PollsPage() {
  await requirePermission("poll:read");
  const t = await getTranslations("app.polls");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  // "Açık mı" sunucudan geliyor: oylamanın kapanışı bağlayıcı bir olay ve
  // ölçütü tarayıcı saati olamaz (MIMARI-PLAN §9a).
  const { rows } = await apiGet(
    "/v1/panel/communication/anketler",
    pollListResponse,
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <Card className="mb-4">
        <CardHeader title={t("quorumReference")} />
        <CardBody className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {Object.values(QUORUM_RULES).map((r) => (
            <div key={r.rule} className="rounded border border-border p-3">
              <div className="font-medium text-fg">
                {tEnum(`quorumRule.${r.rule}`)}
              </div>
              <div className="mt-1 text-xs text-fg-subtle">{r.legalRef}</div>
              <ul className="mt-2 space-y-0.5 text-xs text-fg-muted">
                {tEnum(`quorumExample.${r.rule}`)
                  .split(" · ")
                  .map((e) => (
                    <li key={e}>• {e}</li>
                  ))}
              </ul>
            </div>
          ))}
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
        />
      ) : (
        <Card>
          <CardHeader title={t("pollsTitle")} />
          <CardBody className="space-y-3">
            {rows.map((p) => (
              <div key={p.id} className="rounded border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-fg">{p.question}</h3>
                  <div className="flex gap-2">
                    <Badge tone={p.isOpen ? "success" : "neutral"}>
                      {p.isOpen ? t("open") : t("closed")}
                    </Badge>
                    <Badge tone="info">
                      {tEnum(`pollWeight.${p.weightMode}`)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-1 text-xs text-fg-subtle">
                  {tEnum(`quorumRule.${p.quorumRule as QuorumRule}`)} ·{" "}
                  {t("closesAt", { date: f.date(p.closesAt) })}
                  {p.ownersOnly ? ` · ${t("ownersOnly")}` : ""}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </>
  );
}
