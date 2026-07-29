import { getTranslations } from "next-intl/server";

import { blockListResponse, duesPlanRow } from "@yonetim/contracts";
import { addMonths, currentPeriod, periodKey } from "@yonetim/core";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import type { SearchParamsInput } from "@/lib/list-params";
import { BulkDebtWizard, type BulkDebtPreset } from "./bulk-debt-wizard";

export const dynamic = "force-dynamic";

/**
 * Toplu borçlandırma sihirbazı.
 *
 * `?plan=` İLE PLANDAN DOLDURULABİLİR (PROJE-DURUMU §5.4): aidat planı
 * ekranındaki "bu plandan toplu borç oluştur" bağlantısı buraya geliyor ve
 * formül/tutar/vade/kapsam alanlarını dolduruyor.
 *
 * DOLDURUYOR AMA **BAĞLAMIYOR**: sihirbaz tek seferlik bir borçlandırma
 * yapıyor. Plana bağlanmış olsaydı üretilen borçlar planın dönemsel
 * koşusuyla karışır ve `dues_runs` idempotanslığı iki farklı kaynaktan gelen
 * aynı dönemi ayırt edemezdi. Planın kendisini çalıştırmak için plan
 * ekranındaki "şimdi çalıştır" var.
 */
export default async function BulkDebtPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParamsInput>;
}) {
  await requirePermission("debt:write");
  const t = await getTranslations("app.debts");
  const query = await searchParams;

  const planIdRaw = Array.isArray(query.plan) ? query.plan[0] : query.plan;

  const [{ rows: blocks }, plan] = await Promise.all([
    apiGet("/v1/panel/units/blocks", blockListResponse),
    // Geçersiz/yabancı bir kimlik sessizce yok sayılıyor: sihirbaz ön
    // doldurma olmadan da tam çalışan bir ekran ve bozuk bir bağlantı
    // yüzünden 404 göstermek kullanıcıyı boşuna durdururdu.
    planIdRaw
      ? apiGet(`/v1/panel/dues-plans/${planIdRaw}`, duesPlanRow).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);

  const appliesTo = (plan?.appliesTo ?? {}) as { blockIds?: string[] };

  const preset: BulkDebtPreset | undefined = plan
    ? {
        planName: plan.name,
        formula: plan.formula,
        // `equal` formülünde birim başı tutar, diğerlerinde dağıtılacak havuz
        // — sihirbazın tek tutar alanı da aynı ikili anlamı taşıyor.
        amountKurus:
          plan.formula === "equal"
            ? plan.baseAmountMinor
            : plan.totalAmountMinor,
        dueDay: plan.dueDayOfMonth,
        blockIds: appliesTo.blockIds ?? [],
      }
    : undefined;

  return (
    <>
      <PageHeader
        title={t("bulkWizard")}
        description={t("bulkWizardDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/borclar" },
          { label: t("bulkWizard") },
        ]}
      />
      <BulkDebtWizard
        blocks={blocks.map((block) => ({ id: block.id, name: block.name }))}
        defaultPeriod={periodKey(addMonths(currentPeriod(), 1))}
        cancelHref="/panel/borclar"
        preset={preset}
      />
    </>
  );
}
