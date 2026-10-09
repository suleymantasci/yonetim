import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { InstructionEditor } from "./instruction-editor";

export const dynamic = "force-dynamic";

const payeesSchema = z.object({
  payees: z.array(z.object({ kind: z.enum(["vendor", "staff"]), id: z.string(), name: z.string(), iban: z.string().nullable() })),
  accounts: z.array(z.object({ id: z.string(), label: z.string() })),
});

/**
 * Banka EFT/havale talimatı — firma ya da personel seç (IBAN gelir), tutar
 * ve açıklama gir; talimat listesi PDF olarak bankaya verilir. Banka API'si
 * değil (açık bankacılık entegrasyonu planlı); yalnız belge.
 */
export default async function InstructionPage() {
  await requirePermission("bank:write");
  const t = await getTranslations("app.instruction");
  const tCash = await getTranslations("app.cash");
  const data = await apiGet("/v1/panel/cash/payees", payeesSchema);
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[{ label: tCash("title"), href: "/panel/kasa" }, { label: t("title") }]}
      />
      <InstructionEditor payees={data.payees} accounts={data.accounts} today={new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)} />
    </>
  );
}
