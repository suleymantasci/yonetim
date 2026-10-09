import { getTranslations } from "next-intl/server";

import {
  accountCodesResponse,
  cashDaysResponse,
  collectionReportResponse,
  debtRunDetailResponse,
  debtRunResponse,
  expenseReportResponse,
  memberNotesResponse,
  monthlyReportResponse,
} from "@yonetim/contracts";

import { apiGet, toQuery } from "@/lib/api/server";
import { parseRange, todayIstanbul } from "./report-tools";
import type { FilterField, Params, TabularDef } from "./tabular";

/**
 * Y6 — Yönetimcell'deki ek raporlar. Her biri `tabular.tsx` ile hem ekran
 * hem PDF; veriler `/v1/panel/reports/extra/*`.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
const clean = (q: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(Object.entries(q).filter((e): e is [string, string] => Boolean(e[1])));
const uuidOr = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
const text = (v: string | undefined) => (v ? v.trim().slice(0, 100) || undefined : undefined);
const monthParam = (p: Params, key = "ay") => (p[key] && MONTH.test(p[key]!) ? p[key]! : todayIstanbul().slice(0, 7));

async function rangeFilters(from: string, to: string): Promise<FilterField[]> {
  const t = await getTranslations("app.reportsHub");
  return [
    { name: "from", label: t("from"), type: "date", value: from },
    { name: "to", label: t("to"), type: "date", value: to },
  ];
}

export const collectionsReport: TabularDef = {
  tab: "collections",
  path: "/panel/raporlar/tahsilat",
  build: async ({ params, f, day }) => {
    const t = await getTranslations("app.extraReports");
    const { from, to } = parseRange(params);
    const kind = pick(params.tur, ["all", "member", "external"] as const, "all");
    const q = clean({ from, to, tur: kind === "all" ? undefined : kind, blok: uuidOr(params.blok), hesap: params.hesap === "cash" ? "cash" : uuidOr(params.hesap), ara: text(params.ara) });
    const data = await apiGet(
      `/v1/panel/reports/extra/collections?${toQuery({ from, to, kind, blockId: q.blok, account: q.hesap, q: q.ara })}`,
      collectionReportResponse,
    );
    return {
      title: t("collections.title"),
      description: t("collections.description"),
      period: `${day(from)} – ${day(to)}`,
      filename: `tahsilat-raporu_${from}_${to}`,
      landscape: true,
      query: q,
      filters: [
        ...(await rangeFilters(from, to)),
        { name: "tur", label: t("collections.kind"), type: "select", value: q.tur ?? "", options: [
          { value: "", label: t("all") },
          { value: "member", label: t("collections.member") },
          { value: "external", label: t("collections.external") },
        ] },
        { name: "blok", label: t("block"), type: "select", value: q.blok ?? "", options: [{ value: "", label: t("all") }, ...data.options.blocks.map((b) => ({ value: b.id, label: b.name }))] },
        { name: "hesap", label: t("account"), type: "select", value: q.hesap ?? "", options: [{ value: "", label: t("all") }, { value: "cash", label: t("cash") }, ...data.options.accounts.map((a) => ({ value: a.id, label: a.label }))] },
        { name: "ara", label: t("search"), type: "text", value: q.ara ?? "", placeholder: t("collections.searchHint") },
      ],
      stats: [
        { label: t("collections.member"), value: f.money(data.totals.memberMinor) },
        { label: t("collections.external"), value: f.money(data.totals.externalMinor) },
        { label: t("total"), value: f.money(data.totals.totalMinor), tone: "success" },
        { label: t("count"), value: String(data.rows.length) },
      ],
      sections: [
        {
          title: t("collections.rows"),
          empty: t("empty"),
          columns: [
            { header: t("date"), weight: 1 },
            { header: t("collections.receiptNo"), weight: 1 },
            { header: t("account"), weight: 1.1 },
            { header: t("unit"), weight: 1 },
            { header: t("name"), weight: 1.6, wrap: true },
            { header: t("descriptionCol"), weight: 2.4, wrap: true },
            { header: t("amount"), weight: 1.1, align: "right" },
          ],
          rows: [
            ...data.rows.map((r) => ({
              cells: [f.date(r.date), r.receiptNo ?? "—", r.account, r.unitLabel ?? t("collections.externalShort"), r.name ?? "—", r.description ?? "—", f.money(r.amountMinor)],
            })),
            ...(data.rows.length > 0 ? [{ kind: "grand" as const, cells: [t("total"), "", "", "", "", "", f.money(data.totals.totalMinor)] }] : []),
          ],
        },
      ],
    };
  },
};

export const expensesReport: TabularDef = {
  tab: "expenseDetail",
  path: "/panel/raporlar/gider",
  build: async ({ params, f, day }) => {
    const t = await getTranslations("app.extraReports");
    const { from, to } = parseRange(params);
    const party = pick(params.taraf, ["all", "expense", "vendor", "staff"] as const, "all");
    const state = pick(params.durum, ["all", "paid", "unpaid"] as const, "all");
    const view = pick(params.gorunum, ["detay", "grup"] as const, "detay");
    const q = clean({ from, to, grup: uuidOr(params.grup), firma: uuidOr(params.firma), taraf: party === "all" ? undefined : party, durum: state === "all" ? undefined : state, gorunum: view === "detay" ? undefined : view });
    const data = await apiGet(
      `/v1/panel/reports/extra/expenses?${toQuery({ from, to, categoryId: q.grup, vendorId: q.firma, party, state })}`,
      expenseReportResponse,
    );
    const href = (v: string) => `/panel/raporlar/gider?${new URLSearchParams({ ...q, gorunum: v }).toString()}`;
    const partyLabel = (p: string) => t(`expenses.party.${p}`);
    return {
      title: view === "grup" ? t("expenses.groupTitle") : t("expenses.title"),
      description: t("expenses.description"),
      period: `${day(from)} – ${day(to)}`,
      filename: `${view === "grup" ? "gider-grubu" : "detayli-gider"}_${from}_${to}`,
      landscape: view === "detay",
      query: q,
      views: [
        { label: t("expenses.viewDetail"), href: href("detay"), active: view === "detay" },
        { label: t("expenses.viewGroup"), href: href("grup"), active: view === "grup" },
      ],
      filters: [
        ...(await rangeFilters(from, to)),
        { name: "grup", label: t("expenses.category"), type: "select", value: q.grup ?? "", options: [{ value: "", label: t("all") }, ...data.options.categories.map((c) => ({ value: c.id, label: c.name }))] },
        { name: "firma", label: t("expenses.vendor"), type: "select", value: q.firma ?? "", options: [{ value: "", label: t("all") }, ...data.options.vendors.map((c) => ({ value: c.id, label: c.name }))] },
        { name: "taraf", label: t("expenses.partyLabel"), type: "select", value: q.taraf ?? "", options: [{ value: "", label: t("all") }, ...(["expense", "vendor", "staff"] as const).map((p) => ({ value: p, label: partyLabel(p) }))] },
        { name: "durum", label: t("expenses.state"), type: "select", value: q.durum ?? "", options: [{ value: "", label: t("all") }, { value: "paid", label: t("expenses.paid") }, { value: "unpaid", label: t("expenses.unpaid") }] },
      ],
      stats: [
        { label: t("expenses.total"), value: f.money(data.totals.amountMinor) },
        { label: t("expenses.paid"), value: f.money(data.totals.paidMinor), tone: "success" },
        { label: t("expenses.unpaid"), value: f.money(data.totals.amountMinor - data.totals.paidMinor), tone: data.totals.amountMinor > data.totals.paidMinor ? "warning" : undefined },
        { label: t("count"), value: String(data.rows.length) },
      ],
      sections:
        view === "grup"
          ? [
              {
                title: t("expenses.groups"),
                empty: t("empty"),
                columns: [
                  { header: t("expenses.category"), weight: 3, wrap: true },
                  { header: t("count"), weight: 0.8, align: "right" },
                  { header: t("expenses.paid"), weight: 1.3, align: "right" },
                  { header: t("expenses.unpaid"), weight: 1.3, align: "right" },
                  { header: t("amount"), weight: 1.3, align: "right" },
                ],
                rows: [
                  ...data.groups.map((g) => ({
                    href: `/panel/raporlar/gider?${new URLSearchParams({ ...q, gorunum: "detay", ...(g.categoryId ? { grup: g.categoryId } : {}) }).toString()}`,
                    cells: [g.name ?? t("expenses.noCategory"), String(g.count), f.money(g.paidMinor), f.money(g.amountMinor - g.paidMinor), f.money(g.amountMinor)],
                  })),
                  ...(data.groups.length > 0
                    ? [{ kind: "grand" as const, cells: [t("total"), String(data.rows.length), f.money(data.totals.paidMinor), f.money(data.totals.amountMinor - data.totals.paidMinor), f.money(data.totals.amountMinor)] }]
                    : []),
                ],
              },
            ]
          : [
              {
                title: t("expenses.rows"),
                empty: t("empty"),
                columns: [
                  { header: t("date"), weight: 1 },
                  { header: t("expenses.category"), weight: 1.5, wrap: true },
                  { header: t("expenses.partyLabel"), weight: 1.6, wrap: true },
                  { header: t("descriptionCol"), weight: 2.4, wrap: true },
                  { header: t("expenses.invoiceNo"), weight: 1 },
                  { header: t("expenses.state"), weight: 0.9 },
                  { header: t("amount"), weight: 1.1, align: "right" },
                ],
                rows: [
                  ...data.rows.map((r) => ({
                    href: `/panel/giderler/${r.id}`,
                    cells: [f.date(r.date), r.category ?? "—", r.partyName ? `${r.partyName} (${partyLabel(r.party)})` : partyLabel(r.party), r.description, r.invoiceNo ?? "—", r.paid ? t("expenses.paid") : t("expenses.unpaid"), f.money(r.amountMinor)],
                  })),
                  ...(data.rows.length > 0 ? [{ kind: "grand" as const, cells: [t("total"), "", "", "", "", "", f.money(data.totals.amountMinor)] }] : []),
                ],
              },
            ],
    };
  },
};

export const cashDaysReport: TabularDef = {
  tab: "cashDays",
  path: "/panel/raporlar/kasa-gunluk",
  build: async ({ params, f, day }) => {
    const t = await getTranslations("app.extraReports");
    const view = pick(params.gorunum, ["gunluk", "aylik"] as const, "gunluk");
    const gun = params.gun && DAY.test(params.gun) ? params.gun : todayIstanbul();
    const ay = monthParam(params);
    const [y, m] = ay.split("-").map(Number) as [number, number];
    const from = view === "gunluk" ? gun : `${ay}-01`;
    const to = view === "gunluk" ? gun : new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const hesap = params.hesap && /^10[02](\.\d+)?$/.test(params.hesap) ? params.hesap : undefined;
    const q = clean({ gorunum: view === "gunluk" ? undefined : view, gun: view === "gunluk" ? gun : undefined, ay: view === "aylik" ? ay : undefined, hesap });
    const data = await apiGet(`/v1/panel/reports/extra/cash-days?${toQuery({ from, to, account: hesap })}`, cashDaysResponse);
    const totalIn = data.days.reduce((a, d) => a + d.inMinor, 0);
    const totalOut = data.days.reduce((a, d) => a + d.outMinor, 0);
    const closing = data.days.at(-1)?.closingMinor ?? data.openingMinor;
    const href = (v: string) => `/panel/raporlar/kasa-gunluk?${new URLSearchParams(clean({ gorunum: v, hesap })).toString()}`;
    const accountFilter: FilterField = { name: "hesap", label: t("account"), type: "select", value: hesap ?? "", options: [{ value: "", label: t("allAccounts") }, ...data.accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.label}` }))] };
    return {
      title: view === "gunluk" ? t("cashDays.dailyTitle") : t("cashDays.monthlyTitle"),
      description: t("cashDays.description"),
      period: view === "gunluk" ? day(gun) : f.period(ay),
      filename: view === "gunluk" ? `gunluk-bilanco_${gun}` : `aylik-ozet-bilanco_${ay}`,
      query: q,
      views: [
        { label: t("cashDays.daily"), href: href("gunluk"), active: view === "gunluk" },
        { label: t("cashDays.monthly"), href: href("aylik"), active: view === "aylik" },
      ],
      filters: [
        view === "gunluk"
          ? { name: "gun", label: t("date"), type: "date", value: gun }
          : { name: "ay", label: t("month"), type: "month", value: ay },
        accountFilter,
      ],
      stats: [
        { label: t("cashDays.opening"), value: f.money(data.openingMinor) },
        { label: t("cashDays.in"), value: f.money(totalIn), tone: "success" },
        { label: t("cashDays.out"), value: f.money(totalOut), tone: totalOut > 0 ? "warning" : undefined },
        { label: t("cashDays.closing"), value: f.money(closing) },
      ],
      sections: [
        view === "gunluk"
          ? {
              title: t("cashDays.dailyTable", { date: day(gun) }),
              empty: t("empty"),
              columns: [{ header: "", weight: 3 }, { header: t("amount"), weight: 1.3, align: "right" }],
              rows: [
                { cells: [t("cashDays.openingOf", { date: day(gun) }), f.money(data.openingMinor)] },
                { cells: [t("cashDays.in"), f.money(totalIn)] },
                { cells: [t("cashDays.out"), f.money(totalOut)] },
                { cells: [t("cashDays.net"), f.money(totalIn - totalOut)] },
                { kind: "grand", cells: [t("cashDays.closing"), f.money(closing)] },
              ],
              note: t("cashDays.links"),
            }
          : {
              title: t("cashDays.monthlyTable", { month: f.period(ay) }),
              empty: t("empty"),
              columns: [
                { header: t("date"), weight: 1.2 },
                { header: t("cashDays.in"), weight: 1.2, align: "right" },
                { header: t("cashDays.out"), weight: 1.2, align: "right" },
                { header: t("cashDays.closing"), weight: 1.3, align: "right" },
              ],
              rows: [
                { kind: "muted", cells: [t("cashDays.opening"), "", "", f.money(data.openingMinor)] },
                ...data.days.map((d) => ({
                  href: `/panel/raporlar/kasa-gunluk?${new URLSearchParams(clean({ gun: d.day, hesap })).toString()}`,
                  cells: [day(d.day), f.money(d.inMinor), f.money(d.outMinor), f.money(d.closingMinor)],
                })),
                { kind: "grand", cells: [t("total"), f.money(totalIn), f.money(totalOut), f.money(closing)] },
              ],
            },
      ],
    };
  },
};

export const monthlyReport: TabularDef = {
  tab: "monthly",
  path: "/panel/raporlar/aylik",
  build: async ({ params, f }) => {
    const t = await getTranslations("app.extraReports");
    const ay = monthParam(params);
    const data = await apiGet(`/v1/panel/reports/extra/monthly?period=${ay}`, monthlyReportResponse);
    const tt = data.totals;
    return {
      title: t("monthly.title"),
      description: t("monthly.description"),
      period: f.period(ay),
      filename: `aylik-bilanco_${ay}`,
      query: { ay },
      filters: [{ name: "ay", label: t("month"), type: "month", value: ay }],
      stats: [
        { label: t("monthly.accrued"), value: f.money(tt.accruedMinor) },
        { label: t("monthly.collected"), value: f.money(tt.collectedMinor + tt.externalMinor), tone: "success" },
        { label: t("monthly.expense"), value: f.money(tt.expenseMinor) },
        { label: t("monthly.expensePaid"), value: f.money(tt.expensePaidMinor), tone: tt.expensePaidMinor > 0 ? "warning" : undefined },
      ],
      sections: [
        {
          title: t("monthly.summary"),
          empty: t("empty"),
          columns: [{ header: "", weight: 3 }, { header: t("amount"), weight: 1.3, align: "right" }],
          rows: [
            { cells: [t("monthly.memberCollected"), f.money(tt.collectedMinor)] },
            { cells: [t("monthly.external"), f.money(tt.externalMinor)] },
            { cells: [t("monthly.expensePaid"), f.money(tt.expensePaidMinor)] },
            { kind: "grand", cells: [t("monthly.net"), f.money(tt.collectedMinor + tt.externalMinor - tt.expensePaidMinor)] },
          ],
        },
        {
          title: t("monthly.units"),
          note: t("monthly.unitsHint"),
          empty: t("empty"),
          columns: [
            { header: t("unit"), weight: 1.2 },
            { header: t("monthly.holder"), weight: 2, wrap: true },
            { header: t("monthly.accrued"), weight: 1.2, align: "right" },
            { header: t("monthly.memberCollected"), weight: 1.2, align: "right" },
            { header: t("monthly.remaining"), weight: 1.2, align: "right" },
          ],
          rows: [
            ...data.rows.map((r) => ({
              href: `/panel/birimler/${r.unitId}`,
              cells: [r.unitLabel, r.holder ?? "—", f.money(r.accruedMinor), f.money(r.collectedMinor), f.money(r.remainingMinor)],
            })),
            { kind: "grand", cells: [t("total"), "", f.money(tt.accruedMinor), f.money(tt.collectedMinor), f.money(tt.remainingMinor)] },
          ],
        },
      ],
    };
  },
};

export const debtRunsReport: TabularDef = {
  tab: "debtRuns",
  path: "/panel/raporlar/borclandirma",
  build: async ({ params, f, day }) => {
    const t = await getTranslations("app.extraReports");
    const tEnum = await getTranslations("enum");
    // Tür tanımı olmayan (eski) borçlarda API davranış sınıfını döndürüyor.
    const typeLabel = (name: string) => (tEnum.has(`debtKind.${name}`) ? tEnum(`debtKind.${name}`) : name);
    const view = pick(params.gorunum, ["durum", "detay"] as const, "durum");
    const q = clean({
      gorunum: view === "durum" ? undefined : view,
      tur: uuidOr(params.tur),
      yil: params.yil && /^\d{4}$/.test(params.yil) ? params.yil : undefined,
      donem: params.donem && MONTH.test(params.donem) ? params.donem : undefined,
      from: params.from && DAY.test(params.from) ? params.from : undefined,
      to: params.to && DAY.test(params.to) ? params.to : undefined,
      batch: params.batch && /^[0-9a-f]{32}$/.test(params.batch) ? params.batch : undefined,
    });
    const api = toQuery({ typeId: q.tur, year: q.yil, period: q.donem, from: q.from, to: q.to, batch: q.batch });
    const runs = await apiGet(`/v1/panel/reports/extra/debt-runs?${api}`, debtRunResponse);
    const thisYear = Number(todayIstanbul().slice(0, 4));
    const base = { ...q };
    delete base.batch;
    const href = (v: string) => `/panel/raporlar/borclandirma?${new URLSearchParams(clean({ ...base, gorunum: v === "durum" ? undefined : v })).toString()}`;
    const filters: FilterField[] = [
      { name: "tur", label: t("debtRuns.type"), type: "select", value: q.tur ?? "", options: [{ value: "", label: t("all") }, ...runs.types.map((x) => ({ value: x.id, label: x.name }))] },
      { name: "yil", label: t("debtRuns.year"), type: "select", value: q.yil ?? "", options: [{ value: "", label: t("all") }, ...Array.from({ length: 6 }, (_, i) => String(thisYear + 1 - i)).map((y) => ({ value: y, label: y }))] },
      { name: "donem", label: t("debtRuns.period"), type: "month", value: q.donem ?? "" },
      { name: "from", label: t("debtRuns.createdFrom"), type: "date", value: q.from ?? "" },
      { name: "to", label: t("debtRuns.createdTo"), type: "date", value: q.to ?? "" },
    ];
    const views = [
      { label: t("debtRuns.viewStatus"), href: href("durum"), active: view === "durum" },
      { label: t("debtRuns.viewDetail"), href: href("detay"), active: view === "detay" },
    ];
    const sum = (k: "amountMinor" | "paidMinor" | "remainingMinor") => runs.batches.reduce((a, b) => a + b[k], 0);
    const stats = [
      { label: t("debtRuns.batches"), value: String(runs.batches.length) },
      { label: t("debtRuns.amount"), value: f.money(sum("amountMinor")) },
      { label: t("debtRuns.paid"), value: f.money(sum("paidMinor")), tone: "success" as const },
      { label: t("debtRuns.remaining"), value: f.money(sum("remainingMinor")), tone: sum("remainingMinor") > 0 ? ("warning" as const) : undefined },
    ];
    const batch = q.batch ? runs.batches.find((b) => b.key === q.batch) : undefined;
    const common = { description: t("debtRuns.description"), query: q, filters, views, stats, landscape: true };

    if (view === "durum") {
      return {
        ...common,
        title: t("debtRuns.statusTitle"),
        period: q.donem ? f.period(q.donem) : q.yil ?? t("all"),
        filename: `borclandirma-durum_${q.donem ?? q.yil ?? "tum"}`,
        sections: [
          {
            title: t("debtRuns.statusTable"),
            note: t("debtRuns.statusHint"),
            empty: t("empty"),
            columns: [
              { header: t("debtRuns.createdAt"), weight: 1 },
              { header: t("debtRuns.type"), weight: 1 },
              { header: t("debtRuns.period"), weight: 0.9 },
              { header: t("descriptionCol"), weight: 2, wrap: true },
              { header: t("debtRuns.dueDate"), weight: 1 },
              { header: t("debtRuns.count"), weight: 0.7, align: "right" },
              { header: t("debtRuns.amount"), weight: 1.2, align: "right" },
              { header: t("debtRuns.paid"), weight: 1.2, align: "right" },
              { header: t("debtRuns.remaining"), weight: 1.2, align: "right" },
            ],
            rows: [
              ...runs.batches.map((b) => ({
                href: `/panel/raporlar/borclandirma?${new URLSearchParams({ gorunum: "detay", batch: b.key }).toString()}`,
                cells: [f.date(b.createdAt), typeLabel(b.typeName), b.period ? f.period(b.period) : "—", b.description, day(b.dueDate), String(b.unitCount), f.money(b.amountMinor), f.money(b.paidMinor), f.money(b.remainingMinor)],
              })),
              ...(runs.batches.length > 0 ? [{ kind: "grand" as const, cells: [t("total"), "", "", "", "", "", f.money(sum("amountMinor")), f.money(sum("paidMinor")), f.money(sum("remainingMinor"))] }] : []),
            ],
          },
        ],
      };
    }

    const detail = await apiGet(`/v1/panel/reports/extra/debt-runs/detail?${api}`, debtRunDetailResponse);
    const dt = detail.totals;
    return {
      ...common,
      title: t("debtRuns.detailTitle"),
      description: batch ? `${typeLabel(batch.typeName)} · ${batch.description} · ${day(batch.dueDate)}` : common.description,
      period: batch ? `${batch.description} · ${day(batch.dueDate)}` : q.donem ? f.period(q.donem) : q.yil ?? t("all"),
      filename: `borclandirma-detay_${q.donem ?? q.yil ?? "tum"}`,
      stats: [
        { label: t("debtRuns.count"), value: String(detail.rows.length) },
        { label: t("debtRuns.amount"), value: f.money(dt.amountMinor) },
        { label: t("debtRuns.paid"), value: f.money(dt.paidMinor), tone: "success" },
        { label: t("debtRuns.remaining"), value: f.money(dt.remainingMinor), tone: dt.remainingMinor > 0 ? "warning" : undefined },
      ],
      sections: [
        {
          title: t("debtRuns.detailTable"),
          note: detail.truncated ? t("debtRuns.truncated") : undefined,
          empty: t("empty"),
          columns: [
            { header: t("unit"), weight: 0.9 },
            { header: t("name"), weight: 1.5, wrap: true },
            { header: t("debtRuns.type"), weight: 0.9 },
            { header: t("descriptionCol"), weight: 1.8, wrap: true },
            { header: t("debtRuns.dueDate"), weight: 1 },
            { header: t("debtRuns.lateFee"), weight: 1, align: "right" },
            { header: t("debtRuns.amount"), weight: 1.1, align: "right" },
            { header: t("debtRuns.paid"), weight: 1.1, align: "right" },
            { header: t("debtRuns.remaining"), weight: 1.1, align: "right" },
          ],
          rows: [
            ...detail.rows.map((r) => ({
              cells: [r.unitLabel, r.debtorName ?? "—", typeLabel(r.typeName), r.period ? `${r.description} (${f.period(r.period)})` : r.description, day(r.dueDate), f.money(r.lateFeeMinor), f.money(r.amountMinor), f.money(r.paidMinor), f.money(r.remainingMinor)],
            })),
            ...(detail.rows.length > 0 ? [{ kind: "grand" as const, cells: [t("total"), "", "", "", "", f.money(dt.lateFeeMinor), f.money(dt.amountMinor), f.money(dt.paidMinor), f.money(dt.remainingMinor)] }] : []),
          ],
        },
      ],
    };
  },
};

export const accountCodesReport: TabularDef = {
  tab: "accountCodes",
  path: "/panel/raporlar/muhasebe-kodlari",
  build: async () => {
    const t = await getTranslations("app.extraReports");
    const data = await apiGet("/v1/panel/reports/extra/account-codes", accountCodesResponse);
    const groups = ["assets", "liabilities", "equity", "income", "expense", "other"] as const;
    return {
      title: t("codes.title"),
      description: t("codes.description"),
      period: todayIstanbul(),
      filename: "muhasebe-kodlari",
      query: {},
      filters: [],
      stats: [],
      sections: [
        ...groups
          .map((g) => ({ g, rows: data.accounts.filter((a) => a.group === g) }))
          .filter((x) => x.rows.length > 0)
          .map(({ g, rows }) => ({
            title: t(`codes.group.${g}`),
            empty: t("empty"),
            columns: [{ header: t("codes.code"), weight: 0.8 }, { header: t("codes.name"), weight: 4, wrap: true }],
            rows: rows.map((a) => ({ cells: [a.code, a.name], kind: a.code.includes(".") ? undefined : ("total" as const) })),
          })),
        {
          title: t("codes.parties"),
          note: t("codes.partiesHint"),
          empty: t("empty"),
          columns: [{ header: t("codes.code"), weight: 0.8 }, { header: t("codes.name"), weight: 3, wrap: true }, { header: t("codes.kind"), weight: 1 }],
          rows: data.parties.map((p) => ({ cells: [p.code, p.name, t(`codes.partyKind.${p.kind}`)] })),
        },
      ],
    };
  },
};

export const memberNotesReport: TabularDef = {
  tab: "memberNotes",
  path: "/panel/raporlar/uye-notlari",
  permission: "resident:read",
  build: async ({ params, f, day }) => {
    const t = await getTranslations("app.extraReports");
    const tEnum = await getTranslations("enum");
    const q = clean({
      ara: text(params.ara),
      from: params.from && DAY.test(params.from) ? params.from : undefined,
      to: params.to && DAY.test(params.to) ? params.to : undefined,
    });
    const data = await apiGet(`/v1/panel/reports/extra/member-notes?${toQuery({ q: q.ara, from: q.from, to: q.to })}`, memberNotesResponse);
    return {
      title: t("notes.title"),
      description: t("notes.description"),
      period: q.from || q.to ? `${q.from ? day(q.from) : "…"} – ${q.to ? day(q.to) : "…"}` : todayIstanbul(),
      filename: "uye-notlari",
      query: q,
      filters: [
        { name: "from", label: t("notes.from"), type: "date", value: q.from ?? "" },
        { name: "to", label: t("notes.to"), type: "date", value: q.to ?? "" },
        { name: "ara", label: t("search"), type: "text", value: q.ara ?? "", placeholder: t("notes.searchHint") },
      ],
      stats: [],
      sections: [
        {
          title: t("notes.table", { count: data.rows.length }),
          empty: t("notes.empty"),
          columns: [
            { header: t("notes.updatedAt"), weight: 1 },
            { header: t("notes.updatedBy"), weight: 1.2, wrap: true },
            { header: t("name"), weight: 1.5, wrap: true },
            { header: t("unit"), weight: 1.1, wrap: true },
            { header: t("notes.note"), weight: 4, wrap: true },
          ],
          rows: data.rows.map((r) => ({
            href: `/panel/sakinler/${r.userId}`,
            cells: [f.date(r.updatedAt), r.updatedBy ?? "—", `${r.name} · ${tEnum(`role.${r.role}`)}`, r.units ?? "—", r.note],
          })),
        },
      ],
    };
  },
};
