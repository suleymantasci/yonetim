import { and, asc, eq, isNull } from "drizzle-orm";

import type { Database } from "./client";
import { debtTypes } from "./schema/index";

/**
 * Borç türü tanımları — varsayılanlar ve borçlu kuralı (tek kaynak).
 *
 * Migration `0024_debt_types.sql` aynı listeyi mevcut sitelere yazdı; yeni
 * siteler ilk kullanımda (`ensureDefaultDebtTypes`) alıyor. API (tek/toplu
 * borç, geçiş) ve işler (aidat üretimi, gecikme) buradan okur.
 */
export type DebtTypeDebtor = "occupant" | "owner";
export type DebtTypeLateFeeMode = "none" | "monthly" | "daily";
export type DebtTypeRow = typeof debtTypes.$inferSelect;

export const DEFAULT_DEBT_TYPES: readonly {
  name: string;
  baseKind: DebtTypeRow["baseKind"];
  debtor: DebtTypeDebtor;
  lateFeeMode: DebtTypeLateFeeMode;
}[] = [
  { name: "Aidat", baseKind: "dues", debtor: "occupant", lateFeeMode: "monthly" },
  { name: "Yakıt", baseKind: "utility", debtor: "occupant", lateFeeMode: "monthly" },
  { name: "Demirbaş", baseKind: "extra", debtor: "owner", lateFeeMode: "monthly" },
  { name: "Ek gider", baseKind: "extra", debtor: "occupant", lateFeeMode: "monthly" },
  { name: "Kira", baseKind: "rent", debtor: "occupant", lateFeeMode: "monthly" },
  { name: "Depozito", baseKind: "deposit", debtor: "occupant", lateFeeMode: "none" },
  { name: "İdari ceza", baseKind: "admin_fine", debtor: "owner", lateFeeMode: "none" },
];

/** Sitenin hiç türü yoksa varsayılanları yazar (silinmişler dahil sayılır). */
export async function ensureDefaultDebtTypes(
  tx: Database,
  tenantId: string,
): Promise<void> {
  const [any] = await tx
    .select({ id: debtTypes.id })
    .from(debtTypes)
    .where(eq(debtTypes.tenantId, tenantId))
    .limit(1);
  if (any) return;
  await tx
    .insert(debtTypes)
    .values(
      DEFAULT_DEBT_TYPES.map((t, i) => ({ ...t, tenantId, sortOrder: i + 1 })),
    )
    .onConflictDoNothing();
}

/** Davranış sınıfı `kind` olan ilk etkin tür (aidat üretimi, geçiş). */
export async function defaultDebtTypeFor(
  tx: Database,
  tenantId: string,
  kind: DebtTypeRow["baseKind"],
): Promise<DebtTypeRow | null> {
  await ensureDefaultDebtTypes(tx, tenantId);
  const [row] = await tx
    .select()
    .from(debtTypes)
    .where(
      and(
        eq(debtTypes.tenantId, tenantId),
        eq(debtTypes.baseKind, kind),
        eq(debtTypes.isActive, true),
        isNull(debtTypes.deletedAt),
      ),
    )
    .orderBy(asc(debtTypes.sortOrder), asc(debtTypes.name))
    .limit(1);
  return row ?? null;
}

/**
 * Bu tür bu dairede kime yazılır.
 *
 * Daire istisnası (`owner_pays_dues`) yalnız **aidat** sınıfındaki ve oturana
 * yazılan türleri maliğe çevirir — demirbaş zaten malikte, yakıt/kira
 * oturanda kalır.
 */
export function debtorRuleFor(
  type: Pick<DebtTypeRow, "debtor" | "baseKind">,
  unit: { ownerPaysDues: boolean },
): DebtTypeDebtor {
  if (type.debtor === "owner") return "owner";
  if (type.baseKind === "dues" && unit.ownerPaysDues) return "owner";
  return "occupant";
}
