import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { maskPhone, type Role } from "@yonetim/core";
import { Alert, Card, CardBody, EmptyState, Pagination, Stat } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ListControls } from "@/components/list/list-controls";
import { logDataAccess, requirePermissionWithLog } from "@/lib/access";
import { formatters } from "@/lib/format";
import { buildListHref, pageRange, parseListParams, type SearchParamsInput } from "@/lib/list-params";
import { listResidents, RESIDENT_SORT_KEYS } from "@/lib/queries/residents";
import { ResidentsTable, type ResidentRowView } from "./residents-table";

export const dynamic = "force-dynamic";

export default async function ResidentsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  const ctx = await requirePermissionWithLog("resident:read");
  const t = await getTranslations("app.residents");
  const tCommon = await getTranslations("common");
  const tEnum = await getTranslations("enum");
  const fmt = await formatters();

  const params = parseListParams(await searchParams, {
    sortableKeys: RESIDENT_SORT_KEYS,
    defaultSort: "name",
    filterKeys: ["blok", "rol", "durum"],
  });

  const data = await listResidents(ctx, params);
  const { from, to, pageCount } = pageRange(params, data.total);

  // KVKK md.12: yalnız **gösterilen** sayfadaki kişiler için erişim kaydı.
  // Önceki uygulama ilk 50 kişiyi körü körüne loglıyordu; artık kayıt,
  // fiilen ekranda görünen kişi kümesiyle birebir örtüşüyor.
  for (const row of data.rows) {
    await logDataAccess(ctx, {
      subjectUserId: row.userId,
      dataCategory: "iletisim_bilgisi",
      action: "view",
      purpose: "resident_list_view",
    });
  }

  if (data.activeCount === 0 && !params.query) {
    return (
      <>
        <PageHeader
          title={t("title")}
          action={
            <Link
              href="/panel/sakinler/yeni"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("newResident")}
            </Link>
          }
        />
        <EmptyState
          icon={<Users aria-hidden className="h-10 w-10" />}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
          action={
            <Link
              href="/panel/sakinler/yeni"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("newResident")}
            </Link>
          }
        />
      </>
    );
  }

  const rows: ResidentRowView[] = data.rows.map((row) => ({
    id: row.userId,
    name: [row.firstName, row.lastName].filter(Boolean).join(" ") || t("unnamed"),
    phone: row.phone ? maskPhone(row.phone) : "—",
    email: row.email,
    units: row.occupancies.map((occupancy) => ({
      unitId: occupancy.unitId,
      label: occupancy.blockName
        ? `${occupancy.blockName}/${occupancy.unitNumber}`
        : occupancy.unitNumber,
      relation: occupancy.relation,
      relationLabel: tEnum(`occupancy.${occupancy.relation}`),
    })),
    roleLabel: row.roles[0] ? tEnum(`role.${row.roles[0] as Role}`) : "—",
    whatsappOptIn: row.whatsappOptIn,
    outstanding: row.outstandingKurus > 0 ? fmt.money(row.outstandingKurus) : "—",
    hasOutstanding: row.outstandingKurus > 0,
    multiUnit: row.occupancies.length > 1,
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link
            href="/panel/sakinler/yeni"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {t("newResident")}
          </Link>
        }
      />

      <div className="mb-4">
        <Alert tone="info">{t("privacyNotice")}</Alert>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("statPeople")} value={String(data.activeCount)} />
        <Stat label={t("statOwners")} value={String(data.ownerCount)} />
        <Stat label={t("statTenants")} value={String(data.tenantCount)} />
        <Stat label={t("statWhatsapp")} value={String(data.optInCount)} />
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
              ...data.blocks.map((block) => ({ value: block.id, label: block.name })),
            ],
          },
          {
            param: "rol",
            label: t("role"),
            value: params.filters.rol ?? "",
            options: [
              { value: "", label: t("allRoles") },
              ...(["owner", "tenant_resident", "staff", "auditor", "accountant"] as const).map(
                (role) => ({ value: role, label: tEnum(`role.${role}`) }),
              ),
            ],
          },
          {
            param: "durum",
            label: t("status"),
            value: params.filters.durum ?? "",
            options: [
              { value: "", label: t("allStatuses") },
              { value: "borclu", label: t("filterInDebt") },
              { value: "coklu", label: t("filterMultiUnit") },
            ],
          },
        ]}
      />

      <Card>
        <CardBody className="p-0">
          <ResidentsTable
            rows={rows}
            sort={params.sort}
            direction={params.direction}
            hrefFor={(key, direction) =>
              buildListHref("/panel/sakinler", params, { sirala: key, yon: direction, sayfa: 1 })
            }
            labels={{
              fullName: t("fullName"),
              units: t("units"),
              phone: t("phone"),
              role: t("role"),
              whatsapp: t("whatsapp"),
              outstanding: t("outstanding"),
              empty: tCommon("state.noResult"),
              removeTitle: t("removeTitle"),
              removeDescription: t("removeDescription"),
              optIn: t("whatsappOptIn"),
              optOut: t("whatsappOptOut"),
              multiUnitBadge: t("multiUnitBadge"),
            }}
          />
          <Pagination
            page={params.page}
            pageCount={pageCount}
            total={data.total}
            hrefFor={(page) => buildListHref("/panel/sakinler", params, { sayfa: page })}
            labels={{
              previous: tCommon("action.previous"),
              next: tCommon("action.next"),
              summary: tCommon("state.showing", { from, to, total: data.total }),
            }}
            linkComponent={Link as never}
          />
        </CardBody>
      </Card>
    </>
  );
}
