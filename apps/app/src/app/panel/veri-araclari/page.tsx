import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { dataChecksResponse, residentListResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import Link from "@/components/link";
import { apiGet } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { MergeTool } from "./merge-tool";

export const dynamic = "force-dynamic";

const ICON = { error: AlertOctagon, warning: AlertTriangle, info: Info } as const;
const TONE = { error: "danger", warning: "warning", info: "info" } as const;

/**
 * Veri araçları — Yönetimcell "hata veren üyeler" + "cari birleştir"
 * karşılığı. Kontroller salt okuma; birleştirme gerekçeli ve geri alınamaz.
 */
export default async function DataToolsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("resident:read");
  const t = await getTranslations("app.dataTools");
  const f = await formatters();
  const params = await searchParams;
  const canMerge = can(ctx, "resident:write") && can(ctx, "settings:write");
  const [data, people] = await Promise.all([
    apiGet("/v1/panel/data-tools/checks", dataChecksResponse),
    canMerge ? apiGet("/v1/panel/residents?perPage=200", residentListResponse).catch(() => null) : Promise.resolve(null),
  ]);
  const problems = data.checks.filter((c) => c.count > 0 && c.severity !== "info").reduce((s, c) => s + c.count, 0);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="mb-4">
        <CardHeader
          title={t("checksTitle")}
          description={problems === 0 ? t("allGood") : t("problems", { count: problems })}
        />
        <CardBody className="p-0">
          <ul className="divide-y divide-border">
            {data.checks.map((c) => {
              const Icon = c.count === 0 ? CheckCircle2 : ICON[c.severity];
              return (
                <li key={c.key} className="p-4">
                  <details className="group" open={c.count > 0 && c.severity === "error"}>
                    <summary className="flex cursor-pointer list-none items-start gap-3">
                      <Icon aria-hidden className={`mt-0.5 h-5 w-5 shrink-0 ${c.count === 0 ? "text-success-fg" : c.severity === "error" ? "text-danger-fg" : c.severity === "warning" ? "text-warning-fg" : "text-info-fg"}`} />
                      <span className="flex-1">
                        <span className="block font-semibold text-fg">{t(`check.${c.key}.title`)}</span>
                        <span className="block text-sm text-fg-subtle">{t(`check.${c.key}.hint`)}</span>
                      </span>
                      <Badge tone={c.count === 0 ? "success" : TONE[c.severity]}>{c.count === 0 ? t("ok") : String(c.count)}</Badge>
                    </summary>
                    {c.samples.length > 0 ? (
                      <ul className="mt-3 ml-8 space-y-1 text-sm">
                        {c.samples.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center gap-2">
                            {s.href ? (
                              <Link href={s.href} className="text-primary hover:underline">
                                {s.label}
                              </Link>
                            ) : (
                              <span>{s.label}</span>
                            )}
                            {s.detail ? <span className="text-xs text-fg-subtle">{detail(c.key, s.detail, f.money, t)}</span> : null}
                            {c.key === "duplicate_people" && canMerge ? (
                              <Link href={`/panel/veri-araclari?kaynak=${s.id}#birlestir`} className="text-xs font-semibold text-primary hover:underline">
                                {t("mergeThis")}
                              </Link>
                            ) : null}
                          </li>
                        ))}
                        {c.count > c.samples.length ? <li className="text-xs text-fg-subtle">{t("more", { count: c.count - c.samples.length })}</li> : null}
                      </ul>
                    ) : null}
                  </details>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {canMerge && people ? (
        <MergeTool
          defaultSource={params.kaynak ?? ""}
          people={people.rows.map((p) => ({
            id: p.userId,
            label: [
              [p.firstName, p.lastName].filter(Boolean).join(" ") || "—",
              p.occupancies.filter((o) => !o.former).map((o) => (o.blockName ? `${o.blockName}/${o.unitNumber}` : o.unitNumber)).join(", "),
              p.phoneMasked,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      ) : null}
    </>
  );
}

function detail(key: string, value: string, money: (n: number) => string, t: (k: string, v?: Record<string, string>) => string): string {
  if (key === "open_debt_no_debtor" || key === "overpaid_debt") return money(Number(value));
  if (key === "owner_share_not_100") return t("shareTotal", { pct: String(Number(value)) });
  if (key === "duplicate_people") return t(value === "phone" ? "samePhone" : "sameName");
  if (key === "debt_status_mismatch" || key === "member_no_unit") return t("statusLabel", { value });
  return value;
}
