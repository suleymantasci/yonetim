import { getTranslations } from "next-intl/server";

import { blockListResponse, debtTypeList, openItemsResponse } from "@yonetim/contracts";
import { Card, CardBody, Input, Select } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { MemberScopeSelect } from "../raporlar/report-tools";
import { EvrakNav } from "./evrak-nav";
import { NoticeComposer } from "./notice-composer";
import { NOTICE_FILTER_KEYS, noticeApi } from "./notice-params";

export const dynamic = "force-dynamic";

/**
 * Tebligat — borcu olan bağımsız bölümlere ödeme çağrısı ya da ihtarname.
 *
 * Süzgeç sunucuda (blok, üye kapsamı, tür, dönem ≤, en az tutar, vadesi
 * geçmiş); alıcılar ekranda tek tek çıkarılabilir; metin şablonu
 * düzenlenebilir. PDF her alıcıyı ayrı sayfada, borç dökümüyle basar.
 */
export default async function NoticePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("legal:read");
  await requirePermission("report:read");
  const t = await getTranslations("app.letters");
  const tr = await getTranslations("app.reportsHub");
  const f = await formatters();
  const params = await searchParams;
  const get = (k: string) => params[k];
  const [data, blocks, types] = await Promise.all([
    apiGet(noticeApi(get), openItemsResponse),
    apiGet("/v1/panel/units/blocks", blockListResponse),
    apiGet("/v1/panel/debt-types", debtTypeList),
  ]);
  const filters = Object.fromEntries(
    NOTICE_FILTER_KEYS.map((k) => [k, params[k]]).filter((e): e is [string, string] => !!e[1]),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <EvrakNav active="notice" />

      <Card className="mb-4">
        <CardBody>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-fg-subtle">
              {t("block")}
              <Select name="blok" defaultValue={params.blok ?? ""} className="mt-0.5 h-9">
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
              {t("debtType")}
              <Select name="tur" defaultValue={params.tur ?? ""} className="mt-0.5 h-9">
                <option value="">{t("allTypes")}</option>
                {types.rows.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs text-fg-subtle">
              {t("periodUntil")}
              <Input name="donem" type="month" defaultValue={params.donem ?? ""} className="mt-0.5 h-9" />
            </label>
            <label className="text-xs text-fg-subtle">
              {t("minAmount")}
              <Input name="min" inputMode="decimal" defaultValue={params.min ?? ""} placeholder="500" className="mt-0.5 h-9 w-28" />
            </label>
            <label className="flex h-9 items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="gecikmis" value="1" defaultChecked={params.gecikmis === "1"} className="h-4 w-4" />
              {t("overdueOnly")}
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              {tr("apply")}
            </button>
          </form>
        </CardBody>
      </Card>

      <NoticeComposer
        filters={filters}
        recipients={data.units.map((u) => ({
          unitId: u.unitId,
          label: u.label,
          name: u.debtors.join(", ") || u.holder || "—",
          total: f.money(u.totalMinor),
          overdue: u.overdueMinor > 0 ? f.money(u.overdueMinor) : null,
        }))}
        defaultDueBy={new Date(Date.now() + 10 * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 10)}
      />
    </>
  );
}
