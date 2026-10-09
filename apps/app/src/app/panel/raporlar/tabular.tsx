import { getTranslations } from "next-intl/server";

import { Card, CardBody, CardHeader, Input, Select, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import Link from "@/components/link";
import { requirePermission } from "@/lib/context";
import { formatters, type Formatters } from "@/lib/format";
import type { Block } from "@/lib/pdf/report-pdf";
import { PdfButton } from "./pdf-button";
import { pdfHref, pdfRoute } from "./pdf-route";
import { ReportsSubnav, type ReportTab } from "./report-tools";

/**
 * Tablo raporları (Y6): ekran ve PDF **aynı** tanımdan çiziliyor — süzgeç
 * alanları, özet kutuları, tablolar. Her rapor bir `TabularBuilder`.
 */
export type Params = Record<string, string | undefined>;

export interface FilterField {
  name: string;
  label: string;
  type: "date" | "month" | "text" | "select";
  value: string;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface TabularColumn {
  header: string;
  align?: "left" | "right";
  weight?: number;
  wrap?: boolean;
}

export interface TabularRow {
  cells: string[];
  /** Yalnız ekranda: ilk hücre bağlantı. */
  href?: string;
  kind?: "grand" | "total" | "muted";
}

export interface TabularSection {
  title: string;
  columns: TabularColumn[];
  rows: TabularRow[];
  empty: string;
  note?: string;
}

export interface TabularReport {
  title: string;
  description: string;
  /** PDF alt başlığı (dönem / tarih aralığı). */
  period: string;
  filename: string;
  filters: FilterField[];
  /** Görünüm sekmeleri (ör. günlük / aylık özet). */
  views?: { label: string; href: string; active: boolean }[];
  stats: { label: string; value: string; tone?: "success" | "warning" | "danger" }[];
  sections: TabularSection[];
  landscape?: boolean;
  /** PDF/süzgeç bağlantısında taşınacak parametreler. */
  query: Record<string, string>;
}

export type TabularBuilder = (input: { params: Params; f: Formatters; day: (iso: string) => string }) => Promise<TabularReport>;

export interface TabularDef {
  tab: ReportTab;
  path: string;
  permission?: "report:read" | "resident:read";
  build: TabularBuilder;
}

export function tabularPage(def: TabularDef) {
  return async function TabularPage({ searchParams }: { readonly searchParams: Promise<Params> }) {
    await requirePermission(def.permission ?? "report:read");
    const t = await getTranslations("app.reportsHub");
    const f = await formatters();
    const params = await searchParams;
    const r = await def.build({ params, f, day: (iso) => f.date(new Date(`${iso}T12:00:00`)) });
    return (
      <>
        <PageHeader
          title={r.title}
          description={r.description}
          action={<PdfButton href={pdfHref(def.path, r.query)} label={t("pdf")} title={t("pdfTitle")} />}
        />
        <ReportsSubnav active={def.tab} />
        {r.views ? (
          <div role="tablist" className="mb-3 inline-flex rounded-lg border border-border p-0.5 print:hidden">
            {r.views.map((v) => (
              <Link
                key={v.href}
                href={v.href}
                role="tab"
                aria-selected={v.active}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${v.active ? "bg-primary text-primary-fg" : "text-fg-subtle hover:text-fg"}`}
              >
                {v.label}
              </Link>
            ))}
          </div>
        ) : null}
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
          {Object.entries(r.query)
            .filter(([k]) => !r.filters.some((x) => x.name === k))
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          {r.filters.map((field) => (
            <label key={field.name} className="text-xs text-fg-subtle">
              {field.label}
              {field.type === "select" ? (
                <Select name={field.name} defaultValue={field.value} className="mt-0.5 h-9 max-w-[16rem]">
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  name={field.name}
                  type={field.type}
                  defaultValue={field.value}
                  placeholder={field.placeholder}
                  className={`mt-0.5 h-9 ${field.type === "text" ? "w-48" : ""}`}
                />
              )}
            </label>
          ))}
          <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
            {t("apply")}
          </button>
        </form>
        {r.stats.length > 0 ? (
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {r.stats.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value} tone={s.tone} />
            ))}
          </div>
        ) : null}
        <div className="space-y-4">
          {r.sections.map((sec) => (
            <Card key={sec.title}>
              <CardHeader title={sec.title} description={sec.note} />
              <CardBody className="p-0">
                {sec.rows.length === 0 ? (
                  <p className="p-6 text-sm text-fg-subtle">{sec.empty}</p>
                ) : (
                  <div className={tc.wrapper}>
                    <table className={tc.table}>
                      <thead className={tc.thead}>
                        <tr>
                          {sec.columns.map((c, i) => (
                            <th key={i} scope="col" className={`${tc.th} ${c.align === "right" ? "text-right" : ""}`}>
                              {c.header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sec.rows.map((row, ri) => (
                          <tr key={ri} className={`${tc.tr} ${row.kind === "grand" || row.kind === "total" ? "bg-subtle font-semibold" : ""}`}>
                            {row.cells.map((cell, ci) => {
                              const col = sec.columns[ci];
                              const cls = col?.align === "right" ? `${tc.tdNum} whitespace-nowrap` : col?.wrap ? tc.td : `${tc.td} whitespace-nowrap`;
                              return (
                                <td key={ci} className={cls}>
                                  {ci === 0 && row.href ? (
                                    <Link href={row.href} className="text-primary hover:underline">
                                      {cell}
                                    </Link>
                                  ) : (
                                    cell
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </>
    );
  };
}

export function tabularPdf(def: TabularDef) {
  return pdfRoute(async ({ params, f, day }) => {
    const r = await def.build({ params, f, day });
    const blocks: Block[] = [
      { type: "docTitle", title: r.title, subtitle: r.period },
      ...(r.stats.length > 0 ? [{ type: "stats" as const, items: r.stats.map((s) => ({ label: s.label, value: s.value })) }] : []),
      ...r.sections.flatMap((sec): Block[] => [
        { type: "heading", text: sec.title },
        sec.rows.length === 0
          ? { type: "paragraph", text: sec.empty, muted: true }
          : {
              type: "table",
              columns: sec.columns.map((c) => ({ header: c.header, align: c.align, weight: c.weight, wrap: c.wrap })),
              rows: sec.rows.map((row) => ({ cells: row.cells, kind: row.kind })),
            },
      ]),
    ];
    return { title: r.title, period: r.period, filename: r.filename, landscape: r.landscape, blocks };
  });
}
