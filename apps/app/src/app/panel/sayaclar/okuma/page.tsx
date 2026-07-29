import { getTranslations } from "next-intl/server";

import { meterListResponse } from "@yonetim/contracts";
import { Card, CardBody } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { ReadingBatchForm } from "../reading-batch-form";

export const dynamic = "force-dynamic";

/**
 * `/panel/sayaclar/okuma` — dönemsel toplu okuma girişi.
 *
 * Ayrı bir sayfa (çekmece değil): 60 satırlık bir tablo dar bir çekmecede
 * doldurulacak bir şey değil ve iş tanımı gereği uzun sürüyor — kullanıcı bu
 * ekranda dakikalarca kalıyor, "araya sıkıştırılan" bir akış değil.
 */
export default async function MeterReadingPage() {
  await requirePermission("meter:write");
  const t = await getTranslations("app.meters");
  const tEnum = await getTranslations("enum");

  const { meters, readings } = await apiGet(
    "/v1/panel/operations/sayaclar",
    meterListResponse,
  );

  /*
   * Son okuma her sayaç için ayrı sorgulanmıyor: liste ucu zaten son
   * okumaları dönem sırasına göre getiriyor, ilk eşleşen en yenisi.
   */
  const lastByMeter = new Map<string, (typeof readings)[number]>();
  for (const reading of readings) {
    if (!lastByMeter.has(reading.meterId)) lastByMeter.set(reading.meterId, reading);
  }

  const rows = meters
    .filter((m) => m.isActive)
    .map((m) => {
      const last = lastByMeter.get(m.id);
      return {
        id: m.id,
        label: m.isCommon
          ? `${t("commonAreaShort")}${m.serialNo ? ` · ${m.serialNo}` : ""}`
          : (m.unitNumber ?? t("unknownUnit")),
        typeLabel: tEnum(`meterType.${m.type}`),
        lastValue: last?.currentValue ?? null,
        lastPeriod: last?.period ?? null,
      };
    });

  return (
    <>
      <PageHeader
        title={t("batchTitle")}
        description={t("batchDescription")}
        breadcrumb={[
          { label: t("title"), href: "/panel/sayaclar" },
          { label: t("batchTitle") },
        ]}
      />

      <Card>
        <CardBody>
          <ReadingBatchForm meters={rows} />
        </CardBody>
      </Card>
    </>
  );
}
