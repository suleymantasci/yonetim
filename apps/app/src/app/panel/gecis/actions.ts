"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { migrationCommitResult } from "@yonetim/contracts";
import {
  mapImport,
  slugify,
  type MigrationResult,
  type MigrationSource,
} from "@yonetim/core";

import { apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";

export interface MigrationState {
  ok: boolean;
  message?: string;
  preview?: {
    source: MigrationSource;
    detectedColumns: Record<string, string>;
    summary: MigrationResult["summary"];
    issues: MigrationResult["issues"];
    sample: MigrationResult["units"];
  };
  imported?: { units: number; blocks: number; debts: number };
}

const SOURCES: MigrationSource[] = [
  "apsiyon",
  "biyos",
  "dijiyon",
  "yonetimcell",
  "excel",
];

/** Adım 1: dosyayı analiz et, kaydetmeden önizleme döndür. */
export async function previewMigration(
  _prev: MigrationState,
  formData: FormData,
): Promise<MigrationState> {
  await requirePermission("unit:write");
  const t = await getTranslations("app.migration");

  const file = formData.get("file");
  const source = String(formData.get("source") ?? "excel") as MigrationSource;

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: t("selectFile") };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, message: t("fileTooLarge") };
  }
  if (!SOURCES.includes(source)) {
    return { ok: false, message: t("invalidSource") };
  }

  const content = await file.text();
  const result = mapImport(content, source);

  const blocking = result.issues.filter((i) => i.severity === "error");
  if (blocking.length > 0) {
    return {
      ok: false,
      message: blocking
        .map((i) => t(`issue.${i.code}`, i.params ?? {}))
        .join(" "),
      preview: {
        source,
        detectedColumns: result.detectedColumns,
        summary: result.summary,
        issues: result.issues,
        sample: [],
      },
    };
  }

  return {
    ok: true,
    message: t("readyMessage", { count: result.summary.importable }),
    preview: {
      source,
      detectedColumns: result.detectedColumns,
      summary: result.summary,
      issues: result.issues.slice(0, 20),
      sample: result.units.slice(0, 10),
    },
  };
}

/**
 * Adım 2: onaylanan veriyi kaydet.
 *
 * Dosya içeriği API'ye ham olarak gidiyor ve orada **yeniden** ayrıştırılıyor.
 * Burada ayrıştırıp satırları göndermek daha ucuz olurdu ama önizlemede
 * görülenle yazılanın ayrışmasına kapı açardı; aynı gerekçe toplu
 * borçlandırmadaki tek dağıtım fonksiyonu kararında da geçiyor.
 */
export async function commitMigration(
  _prev: MigrationState,
  formData: FormData,
): Promise<MigrationState> {
  await requirePermission("unit:write");
  const t = await getTranslations("app.migration");

  const file = formData.get("file");
  const source = String(formData.get("source") ?? "excel") as MigrationSource;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: t("fileMissing") };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, message: t("fileTooLarge") };
  }
  if (!SOURCES.includes(source)) {
    return { ok: false, message: t("invalidSource") };
  }

  const content = await file.text();
  // Boş dosyayı API'ye göndermeden yakalıyoruz: kullanıcıya gösterilecek
  // mesaj burada, sunucudan dönen genel doğrulama hatası değil.
  if (mapImport(content, source).units.length === 0) {
    return { ok: false, message: t("noRows") };
  }

  const counts = await apiPost(
    "/v1/panel/migrations",
    {
      source,
      fileName: file.name,
      content,
      carriedBalanceLabel: t("carriedBalanceDescription", { source }),
    },
    migrationCommitResult,
  );

  revalidatePath("/panel/gecis");
  revalidatePath("/panel/birimler");

  return {
    ok: true,
    message: t("completed", {
      units: counts.units,
      blocks: counts.blocks,
      debts: counts.debts,
    }),
    imported: {
      units: counts.units,
      blocks: counts.blocks,
      debts: counts.debts,
    },
  };
}

export { slugify };
