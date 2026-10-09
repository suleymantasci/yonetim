import { getTranslations } from "next-intl/server";
import {
  blockListResponse,
  DETAILED_COLUMNS,
  detailedListResponse,
  householdListRow,
  HOUSEHOLD_RELATIONS,
  listResponse,
  occupancyListRow,
  tcknListRow,
  vehicleListRow,
} from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, Input, Select, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import Link from "@/components/link";
import { apiGet, toQuery } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { memberScopeFromParam } from "@/lib/member-scope";
import { MemberScopeSelect } from "../raporlar/report-tools";

export const dynamic = "force-dynamic";

const TABS = ["ikamet", "plaka", "tc", "bos-dolu", "detayli"] as const;
type Tab = (typeof TABS)[number];

/**
 * Üye listeleri — Yönetimcell "Üyeler" menüsündeki ikamet edenler, araç
 * plakası, TC kimlik, boş/dolu ve detaylı üye dökümü. Tek sayfa, sekmeli;
 * süzgeçler URL'de (yazdırılabilir, paylaşılabilir).
 */
export default async function ListsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("resident:read");
  const t = await getTranslations("app.lists");
  const tExtras = await getTranslations("app.units.extras");
  const tMember = await getTranslations("app.memberScope");
  const tEnum = await getTranslations("enum");
  const f = await formatters();
  const params = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(params.liste ?? "") ? (params.liste as Tab) : "ikamet";
  const member = memberScopeFromParam(params.uye);
  const blockId = params.blok && /^[0-9a-f-]{36}$/.test(params.blok) ? params.blok : undefined;
  const base = { blockId, member: member === "all" ? undefined : member, search: params.q || undefined };
  const canReveal = can(ctx, "resident:write");
  const reveal = params.acik === "1" && canReveal;
  const { rows: blocks } = await apiGet("/v1/panel/units/blocks", blockListResponse);
  const relationLabel = (status: string) =>
    status === "household"
      ? t("householdMember")
      : status.startsWith("former_")
        ? tMember("formerBadge", { relation: tEnum(`ownership.${status.slice(7)}` as "ownership.owner") })
        : tEnum(`ownership.${status}` as "ownership.owner");

  const filterForm = (extra?: React.ReactNode) => (
    <form method="get" className="flex flex-wrap items-end gap-2 print:hidden">
      <input type="hidden" name="liste" value={tab} />
      <label className="text-xs text-fg-subtle">
        {t("block")}
        <Select name="blok" defaultValue={blockId ?? ""} className="mt-0.5 h-9">
          <option value="">{t("allBlocks")}</option>
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </label>
      {tab !== "bos-dolu" ? <MemberScopeSelect value={params.uye} /> : null}
      {tab !== "bos-dolu" ? (
        <label className="text-xs text-fg-subtle">
          {t("search")}
          <Input name="q" defaultValue={params.q ?? ""} className="mt-0.5 h-9 w-44" />
        </label>
      ) : null}
      {extra}
      <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
        {t("apply")}
      </button>
    </form>
  );

  let body: React.ReactNode = null;
  if (tab === "ikamet") {
    const data = await apiGet(
      `/v1/panel/lists/household?${toQuery({ ...base, relation: params.yakinlik || undefined, self: params.yakinlik ? "0" : "1" })}`,
      listResponse(householdListRow),
    );
    body = (
      <ListCard
        title={t("count", { count: data.rows.length })}
        filters={filterForm(
          <label className="text-xs text-fg-subtle">
            {t("relation")}
            <Select name="yakinlik" defaultValue={params.yakinlik ?? ""} className="mt-0.5 h-9">
              <option value="">{t("allPeople")}</option>
              {HOUSEHOLD_RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {tExtras(`relation.${r}`)}
                </option>
              ))}
            </Select>
          </label>,
        )}
        heads={[t("unit"), t("status"), t("relation"), t("name"), t("phone")]}
        rows={data.rows.map((r) => [
          r.unitLabel,
          relationLabel(r.status),
          r.relation === "self" ? t("self") : tExtras(`relation.${r.relation}` as "relation.other"),
          r.fullName,
          r.phoneMasked ?? "—",
        ])}
        empty={t("empty")}
      />
    );
  } else if (tab === "plaka") {
    const has = params.kayit === "yok" ? "no" : params.kayit === "tumu" ? "all" : "yes";
    const data = await apiGet(`/v1/panel/lists/vehicles?${toQuery({ ...base, has })}`, listResponse(vehicleListRow));
    body = (
      <ListCard
        title={t("count", { count: data.rows.length })}
        filters={filterForm(
          <label className="text-xs text-fg-subtle">
            {t("plateRecord")}
            <Select name="kayit" defaultValue={params.kayit ?? "var"} className="mt-0.5 h-9">
              <option value="var">{t("withPlate")}</option>
              <option value="yok">{t("withoutPlate")}</option>
              <option value="tumu">{t("allUnits")}</option>
            </Select>
          </label>,
        )}
        heads={[t("unit"), t("people"), t("plate"), t("vehicle"), t("driver")]}
        rows={data.rows.map((r) => [r.unitLabel, r.people ?? "—", r.plate ?? "—", r.description ?? "—", r.ownerName ?? "—"])}
        mono={2}
        empty={t("empty")}
      />
    );
  } else if (tab === "tc") {
    const data = await apiGet(
      `/v1/panel/lists/tckn?${toQuery({ ...base, reveal: reveal ? "1" : "0" })}`,
      listResponse(tcknListRow),
    );
    body = (
      <ListCard
        title={t("count", { count: data.rows.length })}
        filters={filterForm(
          canReveal ? (
            <label className="flex h-9 items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="acik" value="1" defaultChecked={reveal} className="h-4 w-4" />
              {t("revealTckn")}
            </label>
          ) : null,
        )}
        note={reveal ? t("revealNote") : t("maskedNote")}
        heads={[t("unit"), t("status"), t("name"), t("tckn")]}
        rows={data.rows.map((r) => [r.unitLabel, relationLabel(r.former ? `former_${r.relation}` : r.relation), r.fullName, r.tckn ?? "—"])}
        mono={3}
        empty={t("empty")}
      />
    );
  } else if (tab === "bos-dolu") {
    const state = params.durum === "bos" ? "empty" : params.durum === "dolu" ? "occupied" : "all";
    const data = await apiGet(`/v1/panel/lists/occupancy?${toQuery({ blockId, state })}`, listResponse(occupancyListRow));
    body = (
      <ListCard
        title={t("count", { count: data.rows.length })}
        filters={filterForm(
          <label className="text-xs text-fg-subtle">
            {t("status")}
            <Select name="durum" defaultValue={params.durum ?? ""} className="mt-0.5 h-9">
              <option value="">{t("allUnits")}</option>
              <option value="bos">{t("empty_")}</option>
              <option value="dolu">{t("occupied")}</option>
            </Select>
          </label>,
        )}
        heads={[t("unit"), t("status"), t("owner"), t("tenant"), t("balance")]}
        rows={data.rows.map((r) => [
          r.unitLabel,
          r.occupied ? t("occupied") : t("empty_"),
          r.ownerName ?? "—",
          r.tenantName ?? "—",
          f.money(r.balanceMinor),
        ])}
        numeric={4}
        empty={t("empty")}
      />
    );
  } else {
    // Onay kutuları `?sutun=a&sutun=b` gönderir (dizi); bağlantılar virgüllü.
    const rawCols = params.sutun as unknown as string | string[] | undefined;
    const chosen = (Array.isArray(rawCols) ? rawCols : (rawCols ?? "block,number,name,relation,phone,balance").split(","))
      .filter((c) => (DETAILED_COLUMNS as readonly string[]).includes(c));
    const columns = chosen.length > 0 ? chosen : ["number", "name"];
    const data = await apiGet(
      `/v1/panel/lists/detailed?${toQuery({ ...base, columns: columns.join(","), reveal: reveal ? "1" : "0" })}`,
      detailedListResponse,
    );
    const csvHref = `/panel/listeler/csv?${toQuery({ blok: blockId, uye: params.uye || undefined, q: params.q || undefined, sutun: columns.join(","), acik: reveal ? "1" : undefined })}`;
    body = (
      <ListCard
        title={t("count", { count: data.rows.length })}
        filters={
          <form method="get" className="space-y-3 print:hidden">
            <input type="hidden" name="liste" value="detayli" />
            <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
              <legend className="mb-1 text-xs text-fg-subtle">{t("columns")}</legend>
              {DETAILED_COLUMNS.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" name="sutun" value={c} defaultChecked={columns.includes(c)} className="h-4 w-4" />
                  {t(`col.${c}`)}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-fg-subtle">
                {t("block")}
                <Select name="blok" defaultValue={blockId ?? ""} className="mt-0.5 h-9">
                  <option value="">{t("allBlocks")}</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </label>
              <MemberScopeSelect value={params.uye} />
              {canReveal ? (
                <label className="flex h-9 items-center gap-2 text-sm text-fg">
                  <input type="checkbox" name="acik" value="1" defaultChecked={reveal} className="h-4 w-4" />
                  {t("revealPhone")}
                </label>
              ) : null}
              <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
                {t("apply")}
              </button>
              <a href={csvHref} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
                {t("downloadCsv")}
              </a>
            </div>
          </form>
        }
        heads={data.columns.map((c) => t(`col.${c}`))}
        rows={data.rows}
        empty={t("empty")}
      />
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("title")} className="relative mb-4 flex gap-1 overflow-x-auto border-b border-border print:hidden">
        {TABS.map((key) => (
          <Link
            key={key}
            href={`/panel/listeler?liste=${key}`}
            aria-current={key === tab ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              key === tab ? "border-primary text-fg" : "border-transparent text-fg-subtle hover:text-fg"
            }`}
          >
            {t(`tab.${key}`)}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}

function ListCard({
  title,
  filters,
  heads,
  rows,
  empty,
  note,
  mono,
  numeric,
}: {
  title: string;
  filters: React.ReactNode;
  heads: string[];
  rows: string[][];
  empty: string;
  note?: string;
  mono?: number;
  numeric?: number;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="space-y-2 border-b border-border">
        {filters}
        {note ? <p className="text-xs text-fg-subtle">{note}</p> : null}
      </CardBody>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-fg-subtle">{empty}</p>
        ) : (
          <div className={tc.wrapper}>
            <table className={tc.table}>
              <thead className={tc.thead}>
                <tr>
                  {heads.map((h) => (
                    <th key={h} scope="col" className={tc.th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={tc.tr}>
                    {r.map((cell, j) => (
                      <td
                        key={j}
                        className={j === numeric ? tc.tdNum : `${tc.td} ${j === mono ? "font-mono text-xs" : ""} ${j === 0 ? "whitespace-nowrap font-medium" : ""}`}
                      >
                        {j === 1 && cell.startsWith("(E)") ? <Badge tone="warning">{cell}</Badge> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

