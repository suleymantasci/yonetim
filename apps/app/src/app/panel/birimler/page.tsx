import { Building2, Plus, Trash2 } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import {
  UNIT_SORT_KEYS,
  UNIT_TYPES,
  unitListResponse,
} from "@yonetim/contracts";
import { landShareTotalLooksWrong } from "@yonetim/dues";
import {
  Alert,
  Card,
  CardBody,
  EmptyState,
  Pagination,
  Stat,
} from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ListControls } from "@/components/list/list-controls";
import { toListQuery } from "@/lib/api/list";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import {
  buildListHref,
  pageRange,
  parseListParams,
  type SearchParamsInput,
} from "@/lib/list-params";
import { UnitsTable, type UnitRowView } from "./units-table";

export const dynamic = "force-dynamic";

/**
 * Birim listesi — MIMARI-PLAN §8.5 / A1 dikey dilimi.
 *
 * Bu dosya artık **sunum**: yetki kontrolü ve tek bir API çağrısı. Önceden
 * burada 5 ayrı SQL sorgusu vardı (satırlar, toplam, blok listesi, site
 * toplamları, çöp sayacı); hepsi `/v1/panel/units` içinde tek turda birleşti
 * (§9.2a "bir ekran = bir çağrı").
 */
export default async function UnitsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  // Yetki iki kez kontrol ediliyor ve bu bilinçli: burada **erken** kontrol,
  // yetkisiz kullanıcıya boş bir iskelet yerine doğru hata sayfasını göstermek
  // için. Bağlayıcı karar API'de (`@RequirePermission`) — panel yalnızca kendi
  // gördüğü yetkiye göre arayüz çiziyor, veriye erişimi o karar belirlemiyor.
  await requirePermission("unit:read");
  const t = await getTranslations("app.units");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const params = parseListParams(await searchParams, {
    sortableKeys: UNIT_SORT_KEYS,
    defaultSort: "number",
    filterKeys: ["blok", "tip", "durum"],
  });

  const data = await apiGet(
    `/v1/panel/units?${toListQuery(params, {
      blockId: params.filters.blok,
      type: params.filters.tip,
      status: params.filters.durum,
    })}`,
    unitListResponse,
  );
  const { from, to, pageCount } = pageRange(params, data.meta.total);

  // Hiç birim yoksa (çöp kutusu dahil) eğitici boş durum göster (SPEC 11.2).
  if (
    data.totals.unitTotal === 0 &&
    data.facets.trashedCount === 0 &&
    !params.query
  ) {
    return (
      <>
        <PageHeader
          title={t("title")}
          action={
            <Link
              href="/panel/birimler/yeni"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("newUnit")}
            </Link>
          }
        />
        <EmptyState
          icon={<Building2 aria-hidden className="h-10 w-10" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/panel/birimler/toplu"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
              >
                {t("bulkWizard")}
              </Link>
              <Link
                href="/panel/birimler/yeni"
                className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold text-fg hover:bg-hover"
              >
                {t("newUnit")}
              </Link>
            </div>
          }
        />
      </>
    );
  }

  // Arsa payı toplamı 1.0 ya da 1000 olmalı; sapma varsa yönetici uyarılır.
  const shareLooksWrong = landShareTotalLooksWrong(data.totals.landShareTotal);

  const rows: UnitRowView[] = data.rows.map((row) => {
    const share =
      row.landShareNumerator && row.landShareDenominator
        ? `${row.landShareNumerator}/${row.landShareDenominator}`
        : row.landShare
          ? Number(row.landShare).toFixed(4)
          : "—";

    let statusBadge: UnitRowView["statusBadge"];
    if (row.deletedAt) {
      statusBadge = { label: t("trashed"), tone: "danger" };
    } else if (row.duesExempt) {
      statusBadge = { label: t("duesExempt"), tone: "warning" };
    } else if (row.ownershipType === "vacant") {
      statusBadge = { label: tEnum("occupancy.vacant"), tone: "neutral" };
    } else {
      statusBadge = {
        label: tEnum(`occupancy.${row.ownershipType}`),
        tone: "success",
      };
    }

    return {
      id: row.id,
      number: row.number,
      blockName: row.blockName,
      floor: row.floor,
      typeLabel: tEnum(`unitType.${row.type}`),
      area: row.areaM2
        ? `${Number(row.areaM2).toLocaleString(fmt.locale)} m²`
        : "—",
      landShare: share,
      statusBadge,
      outstanding:
        row.outstandingMinor > 0 ? fmt.money(row.outstandingMinor) : "—",
      hasOutstanding: row.outstandingMinor > 0,
      occupantCount: row.occupantCount,
      multiplier: row.duesMultiplier === "1.000" ? null : row.duesMultiplier,
    };
  });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("summary", {
          units: data.totals.unitTotal,
          blocks: data.facets.blocks.length,
          area: data.totals.areaTotal.toLocaleString(fmt.locale),
          share: data.totals.landShareTotal.toFixed(4),
        })}
        action={
          <>
            <Link
              href="/panel/birimler/bloklar"
              className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              {t("manageBlocks")}
            </Link>
            <Link
              href="/panel/birimler/toplu"
              className="inline-flex h-10 items-center rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              {t("bulkWizard")}
            </Link>
            <Link
              href="/panel/birimler/yeni"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("newUnit")}
            </Link>
          </>
        }
      />

      {shareLooksWrong ? (
        <div className="mb-4">
          <Alert tone="warning">{t("landShareWarning")}</Alert>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("statUnits")} value={String(data.totals.unitTotal)} />
        <Stat
          label={t("statBlocks")}
          value={String(data.facets.blocks.length)}
        />
        <Stat
          label={t("statArea")}
          value={`${data.totals.areaTotal.toLocaleString(fmt.locale)} m²`}
        />
        <Stat
          label={t("statLandShare")}
          value={data.totals.landShareTotal.toFixed(4)}
        />
      </div>

      <ListControls
        searchPlaceholder={t("searchPlaceholder")}
        filters={[
          {
            param: "blok",
            label: t("block"),
            value: params.filters.blok ?? "",
            options: [
              { value: "", label: t("allBlocks") },
              ...data.facets.blocks.map((block) => ({
                value: block.id,
                label: block.label,
              })),
            ],
          },
          {
            param: "tip",
            label: t("type"),
            value: params.filters.tip ?? "",
            options: [
              { value: "", label: t("allTypes") },
              ...UNIT_TYPES.map((type) => ({
                value: type,
                label: tEnum(`unitType.${type}`),
              })),
            ],
          },
          {
            param: "durum",
            label: t("status"),
            value: params.filters.durum ?? "",
            options: [
              { value: "", label: t("allStatuses") },
              { value: "borclu", label: t("filterInDebt") },
              { value: "bos", label: tEnum("occupancy.vacant") },
              { value: "muaf", label: t("duesExempt") },
            ],
          },
        ]}
        trailing={
          <Link
            href={buildListHref("/panel/birimler", params, {
              cop: params.trashed ? "" : "1",
              sayfa: 1,
            })}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${
              params.trashed
                ? "border-danger bg-danger-soft text-danger-fg"
                : "border-border-strong text-fg-muted hover:bg-hover hover:text-fg"
            }`}
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            {t("trash", { count: data.facets.trashedCount })}
          </Link>
        }
      />

      <Card>
        <CardBody className="p-0">
          <UnitsTable
            rows={rows}
            sort={params.sort}
            direction={params.direction}
            basePath="/panel/birimler"
            params={params}
            trashed={params.trashed}
            labels={{
              number: t("number"),
              block: t("block"),
              floor: t("floor"),
              type: t("type"),
              area: t("area"),
              landShare: t("landShare"),
              status: t("status"),
              outstanding: t("outstanding"),
              occupants: t("occupants"),
              empty: tCommon("state.noResult"),
              deleteTitle: t("deleteTitle"),
              deleteDescription: t("deleteDescription"),
              raise: t("bulkRaise"),
              exempt: t("bulkExempt"),
            }}
          />
          <Pagination
            page={params.page}
            pageCount={pageCount}
            total={data.meta.total}
            hrefFor={(page) =>
              buildListHref("/panel/birimler", params, { sayfa: page })
            }
            labels={{
              previous: tCommon("action.previous"),
              next: tCommon("action.next"),
              summary: tCommon("state.showing", {
                from,
                to,
                total: data.meta.total,
              }),
            }}
            linkComponent={Link}
          />
        </CardBody>
      </Card>
    </>
  );
}
