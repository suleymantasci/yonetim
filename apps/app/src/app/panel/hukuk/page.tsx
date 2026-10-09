import { getTranslations } from "next-intl/server";

import { lawyerList, legalCaseListResponse } from "@yonetim/contracts";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Select,
  Stat,
  tableClasses as tc,
} from "@yonetim/ui";

import { hasPermission } from "@yonetim/auth/guard";

import { PageHeader } from "@/components/app-shell";
import Link from "@/components/link";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { CaseActions, OpenCaseButton } from "./case-actions";

export const dynamic = "force-dynamic";

export default async function LegalPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("legal:read");
  const params = await searchParams;
  const lawyerId = params.avukat && /^[0-9a-f-]{36}$/.test(params.avukat) ? params.avukat : undefined;
  const t = await getTranslations("app.legal");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  // İcra adayları da bu uçtan geliyor: eskiden `@yonetim/jobs` üzerinden
  // doğrudan veritabanına gidiliyordu, bu da §8.3'ü dolaylı olarak deliyordu.
  const {
    rows: cases,
    candidates,
    thresholdDays,
    totals,
  } = await apiGet(`/v1/panel/legal${lawyerId ? `?lawyerId=${lawyerId}` : ""}`, legalCaseListResponse);
  const { rows: lawyers } = await apiGet("/v1/panel/legal/lawyers", lawyerList);
  const canWrite = hasPermission(ctx.roles, "legal:write");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { days: thresholdDays })}
        action={
          <Link
            href="/panel/hukuk/avukatlar"
            className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
          >
            {t("lawyersLink")}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("openCases")} value={String(totals.open)} />
        <Stat label={t("principal")} value={f.money(totals.principalMinor)} />
        <Stat
          label={t("collected")}
          value={f.money(totals.collectedMinor)}
          tone="success"
        />
        <Stat
          label={t("candidates")}
          value={String(candidates.length)}
          tone={candidates.length ? "warning" : "neutral"}
        />
      </div>

      {candidates.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title={t("candidatesTitle")}
            description={t("candidatesDescription", { days: thresholdDays })}
          />
          <CardBody className="p-0">
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 560 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={tc.th}>
                      {t("unit")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("totalDebt")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("oldestDue")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("recordCount")}
                    </th>
                    {canWrite ? <th scope="col" className={tc.th} /> : null}
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.unitId} className={tc.tr}>
                      {/* Birim numarası artık sunucudan geliyor; eski ekran
                          id'nin ilk 8 karakterini göstermek zorundaydı. */}
                      <td className={tc.td}>
                        {c.blockName
                          ? `${c.blockName} / ${c.unitNumber}`
                          : c.unitNumber}
                      </td>
                      <td className={tc.tdNum}>{f.money(c.totalMinor)}</td>
                      <td className={tc.td}>
                        {c.oldestDue ? f.date(c.oldestDue) : "—"}
                      </td>
                      <td className={tc.tdNum}>{c.debtCount}</td>
                      {canWrite ? (
                        <td className={tc.td}>
                          <OpenCaseButton
                            unitId={c.unitId}
                            unitLabel={
                              c.blockName
                                ? `${c.blockName} / ${c.unitNumber}`
                                : (c.unitNumber ?? "")
                            }
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title={t("casesTitle")}
          action={
            lawyers.length > 0 ? (
              <form method="get" className="flex items-end gap-2">
                <Select name="avukat" defaultValue={lawyerId ?? ""} aria-label={t("lawyerFilter")} className="h-9 w-48">
                  <option value="">{t("allLawyers")}</option>
                  {lawyers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
                <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
                  {t("filter")}
                </button>
              </form>
            ) : null
          }
        />
        <CardBody className="p-0">
          {cases.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {cases.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <div className="font-medium text-fg">
                      {t("caseLabel", {
                        no: c.caseNo ?? c.id.slice(0, 8),
                        stage: tEnum(`legalStage.${c.stage}`),
                      })}
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {t("openedAt", { date: f.date(c.openedAt) })}
                      {c.lawyerName ? ` · ${t("lawyerShort", { name: c.lawyerName })}` : ""}
                      {c.nextActionAt
                        ? ` · ${t("nextAction", { date: f.date(c.nextActionAt) })}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.collectionScore !== null ? (
                      <Badge
                        tone={
                          c.collectionScore >= 66
                            ? "success"
                            : c.collectionScore >= 36
                              ? "warning"
                              : "danger"
                        }
                      >
                        {t("collectionScore", { score: c.collectionScore })}
                      </Badge>
                    ) : null}
                    <span className="font-semibold tabular-nums">
                      {f.money(
                        c.principalMinor +
                          c.interestMinor +
                          c.costsMinor -
                          c.collectedMinor,
                      )}
                    </span>
                  </div>
                  {/* Kapanmış dosyada işlem yok: aşama ilerletmek, tutar
                      işlemek ve yeniden kapatmak anlamsız. */}
                  {canWrite && !c.closedAt ? (
                    <CaseActions
                      caseId={c.id}
                      stage={c.stage}
                      lawyerId={c.lawyerId}
                      lawyers={lawyers.filter((l) => l.isActive || l.id === c.lawyerId).map((l) => ({ id: l.id, name: l.name }))}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="mt-4">
        <Alert tone="info" title={t("legalNoticeTitle")}>
          {t("legalNoticeBody")}
        </Alert>
      </div>
    </>
  );
}
