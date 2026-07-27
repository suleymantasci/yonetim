import { ConflictException, Injectable } from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type {
  BlockCreate,
  BlockListResponse,
  BlockUpdate,
} from "@yonetim/contracts";
import { blocks, units } from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * Blok CRUD. Küçük olduğu için repository/service ayrımı yapılmadı —
 * §8.5'teki üç katman kuralı SQL'in **tek dosyada** kalmasını istiyor, üç
 * dosya olmasını değil. Modül büyüdüğünde ayrılır.
 */
@Injectable()
export class BlockService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<BlockListResponse> {
    const rows = await this.db.tx(async (tx) =>
      tx
        .select({
          id: blocks.id,
          name: blocks.name,
          floorCount: blocks.floorCount,
          unitCount: blocks.unitCount,
          hasElevator: blocks.hasElevator,
          sortOrder: blocks.sortOrder,
        })
        .from(blocks)
        .where(isNull(blocks.deletedAt))
        .orderBy(asc(blocks.sortOrder), asc(blocks.name)),
    );
    return { rows };
  }

  async create(dto: BlockCreate) {
    const created = await this.db.tx(async (tx) => {
      const ctx = this.db.ctx();
      const [row] = await tx
        .insert(blocks)
        .values({ tenantId: ctx.tenantId, ...dto })
        .returning({ id: blocks.id });
      return row;
    });
    await this.audit.record({
      action: "block_created",
      resource: "block",
      resourceId: created?.id,
    });
    return created;
  }

  async update(id: string, dto: BlockUpdate) {
    await this.db.tx(async (tx) => {
      await tx.update(blocks).set(dto).where(eq(blocks.id, id));
    });
    await this.audit.record({
      action: "block_updated",
      resource: "block",
      resourceId: id,
    });
    return { id };
  }

  /**
   * Blok silme. İçinde aktif birim varsa **engellenir**: birimleri sahipsiz
   * bırakmak (blockId = null) yöneticinin fark etmediği veri kaybı olurdu.
   */
  async softDelete(id: string) {
    const blocked = await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ value: sql<number>`COUNT(*)` })
        .from(units)
        .where(and(eq(units.blockId, id), isNull(units.deletedAt)));
      const count = Number(row?.value ?? 0);
      if (count > 0) return count;

      await tx
        .update(blocks)
        .set({ deletedAt: new Date() })
        .where(eq(blocks.id, id));
      return 0;
    });

    if (blocked > 0)
      throw new ConflictException(`conflict:block_not_empty:${blocked}`);

    await this.audit.record({
      action: "block_deleted",
      resource: "block",
      resourceId: id,
    });
    return { id };
  }
}
