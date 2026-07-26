"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { mapImport, slugify, type MigrationResult, type MigrationSource } from "@yonetim/core";
import { blocks, debts, migrationJobs, units, withTenant } from "@yonetim/db";

import { audit } from "@/lib/audit";
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

const SOURCES: MigrationSource[] = ["apsiyon", "biyos", "dijiyon", "yonetimcell", "excel"];

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
      message: blocking.map((i) => t(`issue.${i.code}`, i.params ?? {})).join(" "),
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

/** Adım 2: onaylanan veriyi kaydet. Açılış bakiyeleri "devir" borcu olarak yazılır. */
export async function commitMigration(
  _prev: MigrationState,
  formData: FormData,
): Promise<MigrationState> {
  const ctx = await requirePermission("unit:write");
  const t = await getTranslations("app.migration");

  const file = formData.get("file");
  const source = String(formData.get("source") ?? "excel") as MigrationSource;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: t("fileMissing") };
  }

  const result = mapImport(await file.text(), source);
  if (result.units.length === 0) {
    return { ok: false, message: t("noRows") };
  }

  const counts = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const [job] = await tx
        .insert(migrationJobs)
        .values({
          tenantId: ctx.tenantId,
          source,
          fileName: file.name,
          status: "running",
          totalRows: result.summary.totalRows,
          mapping: result.detectedColumns,
          startedAt: new Date(),
        })
        .returning({ id: migrationJobs.id });

      // Bloklar
      const blockIds = new Map<string, string>();
      for (const name of result.summary.blocks) {
        const existing = await tx
          .select({ id: blocks.id })
          .from(blocks)
          .where(and(eq(blocks.name, name), isNull(blocks.deletedAt)))
          .limit(1);
        if (existing[0]) {
          blockIds.set(name, existing[0].id);
          continue;
        }
        const [created] = await tx
          .insert(blocks)
          .values({ tenantId: ctx.tenantId, name, floorCount: 1 })
          .returning({ id: blocks.id });
        if (created) blockIds.set(name, created.id);
      }

      let importedUnits = 0;
      let importedDebts = 0;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      for (const u of result.units) {
        const blockId = u.blockName ? blockIds.get(u.blockName) ?? null : null;

        const existing = await tx
          .select({ id: units.id })
          .from(units)
          .where(and(eq(units.number, u.number), isNull(units.deletedAt)))
          .limit(1);
        if (existing[0]) continue;

        const [unit] = await tx
          .insert(units)
          .values({
            tenantId: ctx.tenantId,
            blockId,
            number: u.number,
            floor: u.floor ?? 0,
            type: "flat",
            areaM2: u.areaM2 !== undefined ? String(u.areaM2) : null,
            landShare: u.landShare !== undefined ? String(u.landShare) : null,
            ownershipType: u.tenantName ? "tenant" : "owner",
            metadata: {
              importedFrom: source,
              ownerName: u.ownerName,
              ownerPhone: u.ownerPhone,
              tenantName: u.tenantName,
              tenantPhone: u.tenantPhone,
            },
          })
          .returning({ id: units.id });

        if (!unit) continue;
        importedUnits++;

        if (u.openingBalanceKurus && u.openingBalanceKurus > 0) {
          await tx.insert(debts).values({
            tenantId: ctx.tenantId,
            unitId: unit.id,
            kind: "extra",
            description: t("carriedBalanceDescription", { source }),
            amountKurus: u.openingBalanceKurus,
            dueDate,
            status: "pending",
            metadata: { migrated: true, sourceRow: u.rowIndex },
          });
          importedDebts++;
        }
      }

      const updatedUnitCount = importedUnits;
      await tx
        .update(migrationJobs)
        .set({
          status: "completed",
          importedRows: importedUnits,
          skippedRows: result.summary.totalRows - importedUnits,
          errors: result.issues,
          summary: {
            units: importedUnits,
            debts: importedDebts,
            blocks: blockIds.size,
            openingBalanceKurus: result.summary.totalOpeningBalanceKurus,
          },
          finishedAt: new Date(),
        })
        .where(eq(migrationJobs.id, job!.id));

      return { units: updatedUnitCount, blocks: blockIds.size, debts: importedDebts };
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: "migration_completed",
    resource: "migration_job",
    reason: `${source}: ${counts.units} birim, ${counts.debts} devir borcu`,
  });

  revalidatePath("/panel/gecis");
  revalidatePath("/panel/birimler");

  return {
    ok: true,
    message: t("completed", {
      units: counts.units,
      blocks: counts.blocks,
      debts: counts.debts,
    }),
    imported: counts,
  };
}

export { slugify };
