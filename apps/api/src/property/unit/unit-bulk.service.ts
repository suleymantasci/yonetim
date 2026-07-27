import { Injectable, NotFoundException } from "@nestjs/common";
import { eq, isNull } from "drizzle-orm";

import type {
  UnitBulkCreate,
  UnitBulkCreateResult,
  UnitBulkPreview,
} from "@yonetim/contracts";
import { blocks, units } from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";
import { refreshBlockCount } from "./unit.repository";
import type { Database } from "./types";

/**
 * Toplu birim üretimi — GAP 4.1.1.
 *
 * Önizleme ve yazma **aynı** numaralandırma fonksiyonunu kullanır. Bu, GAP-DURUM
 * kararı 8'in ("yıkıcı işlemde önizleme zorunlu") anlamlı olmasının şartı:
 * iki taraf ayrı hesap yapsaydı önizleme bir şey gösterip başka bir şey
 * yazılabilirdi.
 *
 * Zaten var olan numaralar **atlanır, hata verilmez**: yönetici sihirbazı
 * ikinci kez çalıştırıp eksik kalanları tamamlamak isteyebilir. Hangi
 * numaraların atlandığı sonuçta döner, sessizce yutulmaz.
 */
@Injectable()
export class BulkUnitBuilder {
  constructor(private readonly db: DbService) {}

  async preview(dto: UnitBulkCreate): Promise<UnitBulkPreview> {
    return this.db.tx(async (tx) => {
      const { blockName, existing } = await this.resolveTarget(tx, dto, false);
      const plan = buildNumbers(dto, blockName, existing);
      return {
        numbers: plan.numbers,
        skipped: plan.skipped,
        total: plan.numbers.length,
        blockName,
      };
    });
  }

  async create(dto: UnitBulkCreate): Promise<UnitBulkCreateResult> {
    return this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      const { blockId, blockName, existing } = await this.resolveTarget(
        tx,
        dto,
        true,
      );
      const plan = buildNumbers(dto, blockName, existing);

      const planned = (dto.floorTo - dto.floorFrom + 1) * dto.perFloor;
      // Arsa payı paydası verildiyse pay eşit bölünür (yönetici sonra düzeltir).
      const numeratorEach =
        dto.landShareDenominator != null
          ? Math.max(1, Math.floor(dto.landShareDenominator / planned))
          : undefined;

      const rows = plan.entries.map((entry) => ({
        tenantId: ctx.tenantId,
        blockId,
        number: entry.number,
        floor: entry.floor,
        type: dto.type,
        areaM2: dto.areaM2 != null ? dto.areaM2.toFixed(2) : null,
        landShare:
          numeratorEach !== undefined && dto.landShareDenominator
            ? (numeratorEach / dto.landShareDenominator).toFixed(6)
            : null,
        landShareNumerator: numeratorEach ?? null,
        landShareDenominator: dto.landShareDenominator ?? null,
        ownershipType: "vacant" as const,
      }));

      if (rows.length > 0) await tx.insert(units).values(rows);
      await refreshBlockCount(tx, blockId);

      return { created: rows.length, skipped: plan.skipped };
    });
  }

  /**
   * Hedef bloğu çözer. `allowCreate` false ise (önizleme) yeni blok
   * **açılmaz** — önizlemenin yan etkisi olmamalı.
   */
  private async resolveTarget(
    tx: Database,
    dto: UnitBulkCreate,
    allowCreate: boolean,
  ): Promise<{
    blockId: string | null;
    blockName: string;
    existing: Set<string>;
  }> {
    let blockId = dto.blockId ?? null;
    let blockName = dto.newBlockName ?? "";

    if (blockId) {
      const [existing] = await tx
        .select({ name: blocks.name })
        .from(blocks)
        .where(eq(blocks.id, blockId))
        .limit(1);
      if (!existing) throw new NotFoundException("not_found:block");
      blockName = existing.name;
    } else if (allowCreate && dto.newBlockName) {
      const ctx = this.db.ctx();
      const [created] = await tx
        .insert(blocks)
        .values({
          tenantId: ctx.tenantId,
          name: dto.newBlockName,
          floorCount: dto.floorTo - dto.floorFrom + 1,
          sortOrder: 0,
        })
        .returning({ id: blocks.id });
      blockId = created?.id ?? null;
    }

    const rows = await tx
      .select({ number: units.number })
      .from(units)
      .where(
        blockId === null ? isNull(units.blockId) : eq(units.blockId, blockId),
      );

    return { blockId, blockName, existing: new Set(rows.map((r) => r.number)) };
  }
}

interface NumberPlan {
  entries: { number: string; floor: number }[];
  numbers: string[];
  skipped: string[];
}

/** Önizleme ve yazma bunun **aynı** çıktısını kullanır. */
export function buildNumbers(
  dto: UnitBulkCreate,
  blockName: string,
  existing: Set<string>,
): NumberPlan {
  const seen = new Set(existing);
  const entries: NumberPlan["entries"] = [];
  const skipped: string[] = [];

  for (let floor = dto.floorFrom; floor <= dto.floorTo; floor += 1) {
    for (let index = 1; index <= dto.perFloor; index += 1) {
      const sequence =
        dto.numbering === "floorPrefixed"
          ? `${floor}${String(index).padStart(2, "0")}`
          : String((floor - dto.floorFrom) * dto.perFloor + index);

      const number = dto.pattern
        .replaceAll("{blok}", blockName)
        .replaceAll("{kat}", String(floor))
        .replaceAll("{no}", sequence)
        .slice(0, 20);

      if (seen.has(number)) {
        skipped.push(number);
        continue;
      }
      seen.add(number);
      entries.push({ number, floor });
    }
  }

  return { entries, numbers: entries.map((e) => e.number), skipped };
}
