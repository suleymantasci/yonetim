import { Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, type SQL } from "drizzle-orm";

import type { AgendaItem, AgendaList, AgendaWrite } from "@yonetim/contracts";
import { agendaItems, blocks, units, users } from "@yonetim/db";

import { DbService } from "../infra/db/db.service";
import type { Database } from "../property/unit/types";

type Row = typeof agendaItems.$inferSelect;

/** Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). */
const ISTANBUL = "+03:00";
const DEFAULT_TIME = "09:00";

/**
 * Ajanda — takvimde görev ve not.
 *
 * Görünürlük: kişisel kayıt yalnız sahibine, `shared` kayıt sitenin panel
 * ekibine. RLS siteyi ayırıyor; kişisel/paylaşılan ayrımı burada, her
 * sorguda aynı `visible()` koşuluyla. Düzenleme de aynı kural: paylaşılan
 * kayıt ekibin ortak işi.
 */
@Injectable()
export class AgendaService {
  constructor(private readonly db: DbService) {}

  async range(from: string, to: string, unitId?: string): Promise<AgendaList> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(agendaItems)
        .where(
          and(
            this.visible(),
            gte(agendaItems.day, from),
            lte(agendaItems.day, to),
            ...(unitId ? [eq(agendaItems.unitId, unitId)] : []),
          ),
        )
        .orderBy(asc(agendaItems.day), asc(agendaItems.remindAt), asc(agendaItems.createdAt))
        .limit(1000);
      return { rows: await this.present(tx, rows) };
    });
  }

  /** Üst bardaki not listesi: tarihli/tarihsiz notlar, en yenisi üstte. */
  async notes(): Promise<AgendaList> {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(agendaItems)
        .where(and(this.visible(), eq(agendaItems.kind, "note")))
        .orderBy(desc(agendaItems.updatedAt))
        .limit(30);
      return { rows: await this.present(tx, rows) };
    });
  }

  async get(id: string): Promise<AgendaItem> {
    return this.db.tx(async (tx) => {
      const row = await this.find(tx, id);
      return (await this.present(tx, [row]))[0]!;
    });
  }

  async create(dto: AgendaWrite): Promise<{ id: string }> {
    const ctx = this.db.ctx();
    return this.db.tx(async (tx) => {
      const [row] = await tx
        .insert(agendaItems)
        .values({
          tenantId: ctx.tenantId,
          createdBy: ctx.userId!,
          ...columns(dto),
        })
        .returning({ id: agendaItems.id });
      return row!;
    });
  }

  async update(id: string, dto: AgendaWrite): Promise<{ id: string }> {
    return this.db.tx(async (tx) => {
      const before = await this.find(tx, id);
      const next = columns(dto);
      // Hatırlatma zamanı değiştiyse yeniden gönderilsin.
      const moved = (before.remindAt?.getTime() ?? null) !== (next.remindAt?.getTime() ?? null);
      await tx
        .update(agendaItems)
        .set({ ...next, ...(moved ? { remindedAt: null } : {}), updatedAt: new Date() })
        .where(eq(agendaItems.id, id));
      return { id };
    });
  }

  async setDone(id: string, done: boolean): Promise<{ id: string }> {
    return this.db.tx(async (tx) => {
      await this.find(tx, id);
      await tx
        .update(agendaItems)
        .set({ doneAt: done ? new Date() : null, updatedAt: new Date() })
        .where(eq(agendaItems.id, id));
      return { id };
    });
  }

  async remove(id: string): Promise<{ id: string }> {
    return this.db.tx(async (tx) => {
      await this.find(tx, id);
      await tx.update(agendaItems).set({ deletedAt: new Date() }).where(eq(agendaItems.id, id));
      return { id };
    });
  }

  private visible(): SQL {
    const userId = this.db.ctx().userId!;
    return and(
      isNull(agendaItems.deletedAt),
      or(eq(agendaItems.shared, true), eq(agendaItems.createdBy, userId)),
    )!;
  }

  private async find(tx: Database, id: string): Promise<Row> {
    const [row] = await tx
      .select()
      .from(agendaItems)
      .where(and(eq(agendaItems.id, id), this.visible()))
      .limit(1);
    if (!row) throw new NotFoundException("not_found");
    return row;
  }

  private async present(tx: Database, rows: Row[]): Promise<AgendaItem[]> {
    if (rows.length === 0) return [];
    const me = this.db.ctx().userId;
    const unitIds = [...new Set(rows.flatMap((r) => (r.unitId ? [r.unitId] : [])))];
    const labels = new Map<string, string>();
    if (unitIds.length > 0) {
      const unitRows = await tx
        .select({ id: units.id, number: units.number, blockName: blocks.name })
        .from(units)
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(inArray(units.id, unitIds));
      for (const u of unitRows) labels.set(u.id, u.blockName ? `${u.blockName} / ${u.number}` : u.number);
    }
    // Kişi adları global `users` tablosunda (RLS dışı): yalnız paylaşılan
    // kayıtların sahipleri, kontrollü bypass ile.
    const authorIds = [...new Set(rows.filter((r) => r.shared).map((r) => r.createdBy))];
    const names = new Map<string, string>();
    if (authorIds.length > 0) {
      const people = await this.db.bypass("agenda:authors", (btx) =>
        btx
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(inArray(users.id, authorIds)),
      );
      for (const p of people) names.set(p.id, [p.firstName, p.lastName].filter(Boolean).join(" "));
    }
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as AgendaItem["kind"],
      title: r.title,
      body: r.body,
      unitId: r.unitId,
      unitLabel: r.unitId ? (labels.get(r.unitId) ?? null) : null,
      day: r.day,
      time: r.remindAt ? istanbulTime(r.remindAt) : null,
      remindAt: r.remindAt,
      remindedAt: r.remindedAt,
      doneAt: r.doneAt,
      shared: r.shared,
      mine: r.createdBy === me,
      createdByName: names.get(r.createdBy) ?? null,
      createdAt: r.createdAt,
    }));
  }
}

function columns(dto: AgendaWrite) {
  const day = dto.day ?? null;
  return {
    kind: dto.kind,
    title: dto.title,
    body: dto.body ?? null,
    unitId: dto.unitId ?? null,
    day,
    remindAt: dto.remind && day ? new Date(`${day}T${dto.time ?? DEFAULT_TIME}:00${ISTANBUL}`) : null,
    shared: dto.shared,
  };
}

function istanbulTime(at: Date): string {
  return new Date(at.getTime() + 3 * 3_600_000).toISOString().slice(11, 16);
}
