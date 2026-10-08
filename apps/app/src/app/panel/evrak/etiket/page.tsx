import { getTranslations } from "next-intl/server";

import { blockListResponse, recipientResponse } from "@yonetim/contracts";
import { Card, CardBody, CardHeader, Select } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet, toQuery } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { memberScopeFromParam } from "@/lib/member-scope";
import { MemberScopeSelect } from "../../raporlar/report-tools";
import { EvrakNav } from "../evrak-nav";

export const dynamic = "force-dynamic";

const LABEL_SIZES = ["2x4", "2x5", "2x6"] as const;

/** Adres etiketi — blok ve üye kapsamına göre, 2×4 / 2×5 / 2×6 etiket kâğıdı. */
export default async function LabelsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("resident:read");
  const t = await getTranslations("app.letters");
  const params = await searchParams;
  const member = memberScopeFromParam(params.uye);
  const blockId = params.blok && /^[0-9a-f-]{36}$/.test(params.blok) ? params.blok : undefined;
  const [blocks, data] = await Promise.all([
    apiGet("/v1/panel/units/blocks", blockListResponse),
    apiGet(`/v1/panel/letters/recipients?${toQuery({ member: member === "all" ? undefined : member, blockId })}`, recipientResponse),
  ]);
  const size = (LABEL_SIZES as readonly string[]).includes(params.boyut ?? "") ? params.boyut! : "2x5";
  const canPhones = can(ctx, "report:export");
  // PDF ile aynı kural: kişi başına seçiliyse her kişi, değilse bölüm başına bir etiket.
  const labelCount =
    params.kisi === "1" ? data.rows.reduce((n, u) => n + Math.max(1, u.people.length), 0) : data.rows.length;
  const pdfQuery = toQuery({ blok: blockId, uye: params.uye || undefined, boyut: size, tel: params.tel === "1" && canPhones ? "1" : undefined, kisi: params.kisi === "1" ? "1" : undefined });

  return (
    <>
      <PageHeader title={t("title")} description={t("labelsDescription")} />
      <EvrakNav active="labels" />
      <Card>
        <CardHeader title={t("labelsCount", { count: labelCount })} />
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-fg-subtle">
              {t("block")}
              <Select name="blok" defaultValue={blockId ?? ""} className="mt-0.5 h-9">
                <option value="">{t("allBlocks")}</option>
                {blocks.rows.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </label>
            <MemberScopeSelect value={params.uye} />
            <label className="text-xs text-fg-subtle">
              {t("labelSize")}
              <Select name="boyut" defaultValue={size} className="mt-0.5 h-9">
                {LABEL_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("x", " × ")}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex h-9 items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="kisi" value="1" defaultChecked={params.kisi === "1"} className="h-4 w-4" />
              {t("labelPerPerson")}
            </label>
            {canPhones ? (
              <label className="flex h-9 items-center gap-2 text-sm text-fg">
                <input type="checkbox" name="tel" value="1" defaultChecked={params.tel === "1"} className="h-4 w-4" />
                {t("labelPhone")}
              </label>
            ) : null}
            <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
              {t("choose")}
            </button>
            <a
              href={`/panel/evrak/etiket/pdf?${pdfQuery}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              {t("labelsPdf")}
            </a>
          </form>
          {params.tel === "1" && canPhones ? <p className="mt-3 text-xs text-fg-subtle">{t("labelPhoneNote")}</p> : null}
          <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {data.rows.slice(0, 12).map((u) => (
              <li key={u.unitId} className="rounded-md border border-dashed border-border p-3">
                <span className="block font-semibold">
                  {u.people
                    .filter((p) => !p.former || member === "former_owner" || member === "former_tenant")
                    .map((p) => p.name)
                    .join(", ") || t("labelResident")}
                </span>
                <span className="block text-fg-subtle">{u.unitLabel}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
