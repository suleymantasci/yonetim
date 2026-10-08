"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  migrationCommitResult,
  migrationPreview,
  type MigrationPreview,
  type UnitImportFieldName,
} from "@yonetim/contracts";

import { apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { reasonMessage } from "@/lib/form";

type Outcome<T> = { ok: true; data: T; message?: string } | { ok: false; message: string };

export interface MigrationFileInput {
  fileName: string;
  fileBase64: string;
  headerRow?: number;
  mapping?: Record<string, UnitImportFieldName>;
}

/** API'nin `migration_*` kodunu (ya da paket sınırı gerekçesini) kullanıcı metnine çevir. */
async function explain(error: unknown): Promise<string> {
  const t = await getTranslations("app.migration");
  const reason = await reasonMessage(error);
  if (reason) return reason;
  const raw = error instanceof Error ? error.message : "";
  if (raw.startsWith("migration_") && t.has(`error.${raw}`)) return t(`error.${raw}`);
  return t("error.generic");
}

/** Dosyayı oku, başlık ve sütunları tahmin et (ya da verilen eşleştirmeyi uygula). Yazmaz. */
export async function previewMigration(input: MigrationFileInput): Promise<Outcome<MigrationPreview>> {
  await requirePermission("unit:write");
  try {
    const data = await apiPost("/v1/panel/migrations/preview", input, migrationPreview);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, message: await explain(error) };
  }
}

/**
 * Onaylanan eşleştirmeyle aktar. Dosya API'de **yeniden** okunuyor: önizlemede
 * görülenle yazılanın ayrışmaması için hazır satır gönderilmiyor.
 */
export async function commitMigration(
  input: Required<Omit<MigrationFileInput, "headerRow" | "mapping">> & {
    headerRow: number;
    mapping: Record<string, UnitImportFieldName>;
  },
): Promise<Outcome<{ units: number }>> {
  await requirePermission("unit:write");
  const t = await getTranslations("app.migration");
  try {
    const r = await apiPost(
      "/v1/panel/migrations",
      { ...input, carriedBalanceLabel: t("carriedBalanceDescription") },
      migrationCommitResult,
    );
    return {
      ok: true,
      data: { units: r.units },
      message: t("completed", {
        units: r.units,
        existing: r.existingUnits,
        restored: r.restoredUnits,
        blocks: r.blocks,
        people: r.peopleCreated,
        debts: r.debts,
        withBalance: r.withBalance,
      }),
    };
  } catch (error) {
    return { ok: false, message: await explain(error) };
  }
}

/** Aktarımı geri al: devir borçları iptal, aktarımın açtığı boş daireler çöp kutusuna. */
export async function revertMigration(jobId: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("unit:write");
  const t = await getTranslations("app.migration");
  try {
    const r = await apiPost(
      `/v1/panel/migrations/${encodeURIComponent(jobId)}/revert`,
      {},
      z.object({ debts: z.number().int(), units: z.number().int() }),
    );
    return { ok: true, message: t("reverted", { debts: r.debts, units: r.units }) };
  } catch (error) {
    return { ok: false, message: await explain(error) };
  }
}
