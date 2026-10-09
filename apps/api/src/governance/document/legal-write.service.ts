import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull, ne, sql, notInArray } from "drizzle-orm";

import type {
  LegalAmountEntry,
  LegalStage,
  LegalCaseClose,
  LegalCaseCreate,
  LegalCaseUpdate,
  LegalEventCreate,
} from "@yonetim/contracts";
import { errors, formatKurus } from "@yonetim/core";
import { debts, legalCaseEvents, legalCases, units } from "@yonetim/db";

import { AuditService } from "../audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * İcra/hukuk takibi — yazma yüzeyi (SPEC Bölüm 3.5).
 *
 * OKUMA UCU AYLARDIR VARDI, YAZMA YOKTU: ekran açık dosyaları ve icra adayı
 * daireleri listeliyor, ama yönetici dosyayı **açamıyordu**. Yani modül,
 * kendi verisini elle SQL yazan biri olmadan hiç dolmuyordu.
 *
 * KÜTÜK KENDİLİĞİNDEN YAZILIYOR. Her aşama değişikliği ve her para hareketi
 * `legal_case_events`'e bir satır düşürüyor. Ayrı bir "not ekle" adımına
 * bırakılsaydı, dosyanın geçmişi kimin üşenmediğine bağlı olurdu — oysa bir
 * icra dosyasında "ne zaman hangi aşamaya geçildi" sorusunun cevabı, itiraz
 * süresi hesaplanırken gereken şeyin ta kendisi.
 */
@Injectable()
export class LegalWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Dosya aç.
   *
   * ANA PARA SUNUCUDA TOPLANIYOR: dairenin ödenmemiş borçlarının kalanı.
   * İstemciden alınsaydı ekranda gösterilen ile dosyaya yazılan ayrışabilirdi
   * — ve bu, hakkında icra takibi başlatılan rakam.
   */
  async create(dto: LegalCaseCreate): Promise<{ id: string }> {
    const ctx = this.db.ctx();

    return this.db.tx(async (tx) => {
      const unitRows = await tx
        .select({ id: units.id, number: units.number })
        .from(units)
        .where(and(eq(units.id, dto.unitId), isNull(units.deletedAt)))
        .limit(1);
      const unit = unitRows[0];
      if (!unit) throw new NotFoundException("unit_not_found");

      /*
       * AYNI DAİREYE İKİNCİ AÇIK DOSYA YOK. Aksi halde aynı borç iki dosyada
       * takip edilir, iki kez tahsil edilmiş görünür ve hangi dosyanın
       * gerçek olduğu kimse bilemezdi.
       */
      const open = await tx
        .select({ id: legalCases.id })
        .from(legalCases)
        .where(
          and(
            eq(legalCases.unitId, dto.unitId),
            isNull(legalCases.closedAt),
            ne(legalCases.stage, "closed"),
          ),
        )
        .limit(1);
      if (open[0]) throw new ConflictException("case_already_open");

      const debtRows = await tx
        .select({
          amountKurus: debts.amountKurus,
          lateFeeKurus: debts.lateFeeKurus,
          paidKurus: debts.paidKurus,
        })
        .from(debts)
        .where(
          and(
            eq(debts.unitId, dto.unitId),
            isNull(debts.deletedAt),
            notInArray(debts.status, ["paid", "written_off"]),
          ),
        );

      // Ana para ile gecikme tazminatı **ayrı** kolonlarda: icra talebinde de
      // ayrı kalemler ve tek toplamda birleştirmek onları geri ayırmayı
      // imkânsız kılardı.
      const principal = debtRows.reduce(
        (sum, d) => sum + Math.max(0, d.amountKurus - d.paidKurus),
        0,
      );
      const interest = debtRows.reduce((sum, d) => sum + d.lateFeeKurus, 0);
      if (principal + interest <= 0) throw errors.validation("no_open_debt");

      const [row] = await tx
        .insert(legalCases)
        .values({
          tenantId: ctx.tenantId,
          unitId: dto.unitId,
          caseNo: dto.caseNo ?? null,
          stage: "warning_letter",
          principalKurus: principal,
          interestKurus: interest,
        })
        .returning({ id: legalCases.id });

      await tx.insert(legalCaseEvents).values({
        tenantId: ctx.tenantId,
        caseId: row!.id,
        stage: "warning_letter",
        title: `Dosya açıldı — ${unit.number}`,
        note: dto.note ?? `Ana para ${formatKurus(principal)}, gecikme ${formatKurus(interest)}`,
        createdBy: ctx.userId ?? null,
      });

      await this.audit.record({
        action: "legal_case.opened",
        resource: "legal_case",
        resourceId: row!.id,
        reason: `Daire ${unit.number} — ${formatKurus(principal + interest)}`,
      });

      return { id: row!.id };
    });
  }

  /** Aşama, dosya numarası ve sıradaki işlem. */
  async update(id: string, dto: LegalCaseUpdate): Promise<{ ok: true }> {
    const ctx = this.db.ctx();

    await this.db.tx(async (tx) => {
      const current = await this.load(tx, id);

      // `closed` bu uçtan verilmiyor: kapatmak gerekçe istiyor ve ayrı uçta.
      if (dto.stage === "closed") throw errors.validation("use_close_endpoint");
      if (current.closedAt) throw errors.validation("case_closed");

      await tx
        .update(legalCases)
        .set({
          ...(dto.stage ? { stage: dto.stage } : {}),
          ...(dto.caseNo !== undefined ? { caseNo: dto.caseNo ?? null } : {}),
          ...(dto.lawyerId !== undefined ? { lawyerId: dto.lawyerId ?? null } : {}),
          ...(dto.nextActionAt !== undefined
            ? { nextActionAt: dto.nextActionAt ?? null }
            : {}),
          ...(dto.nextActionNote !== undefined
            ? { nextActionNote: dto.nextActionNote ?? null }
            : {}),
        })
        .where(eq(legalCases.id, id));

      // Aşama gerçekten değiştiyse kütüğe düşüyor; aynı aşamayı yeniden
      // seçmek bir olay değil ve kütüğü gürültüyle doldururdu.
      if (dto.stage && dto.stage !== current.stage) {
        await tx.insert(legalCaseEvents).values({
          tenantId: ctx.tenantId,
          caseId: id,
          stage: dto.stage,
          title: `Aşama: ${current.stage} → ${dto.stage}`,
          note: dto.note ?? null,
          createdBy: ctx.userId ?? null,
        });

        await this.audit.record({
          action: "legal_case.stage_changed",
          resource: "legal_case",
          resourceId: id,
          reason: `${current.stage} → ${dto.stage}`,
        });
      }
    });

    return { ok: true };
  }

  /** Elle olay: duruşma, tebligat, avukat görüşmesi. */
  async addEvent(id: string, dto: LegalEventCreate): Promise<{ ok: true }> {
    const ctx = this.db.ctx();

    await this.db.tx(async (tx) => {
      const current = await this.load(tx, id);

      await tx.insert(legalCaseEvents).values({
        tenantId: ctx.tenantId,
        caseId: id,
        // Olayın aşaması dosyanın **o anki** aşaması: olay sonradan
        // okunduğunda hangi evrede yaşandığı görünsün.
        stage: current.stage,
        title: dto.title,
        note: dto.note ?? null,
        documentUrl: dto.documentUrl ?? null,
        occurredAt: dto.occurredAt ?? new Date(),
        createdBy: ctx.userId ?? null,
      });
    });

    await this.audit.record({
      action: "legal_case.event_added",
      resource: "legal_case",
      resourceId: id,
      reason: dto.title,
    });

    return { ok: true };
  }

  /**
   * Masraf ya da tahsilat — **artımlı**.
   *
   * Mutlak tutar yazdırmak, iki yöneticinin aynı anda kaydettiği iki
   * tahsilattan birinin diğerini ezmesi demekti (son yazan kazanır). `+`
   * ile yazmak o yarışta ikisini de topluyor; sayı veritabanında artıyor,
   * uygulamada okunup geri yazılmıyor.
   */
  async addAmount(id: string, dto: LegalAmountEntry): Promise<{ ok: true }> {
    const ctx = this.db.ctx();

    await this.db.tx(async (tx) => {
      const current = await this.load(tx, id);
      if (current.closedAt) throw errors.validation("case_closed");

      const column = dto.kind === "cost" ? legalCases.costsKurus : legalCases.collectedKurus;
      await tx
        .update(legalCases)
        .set({ [dto.kind === "cost" ? "costsKurus" : "collectedKurus"]: sql`${column} + ${dto.amountMinor}` })
        .where(eq(legalCases.id, id));

      await tx.insert(legalCaseEvents).values({
        tenantId: ctx.tenantId,
        caseId: id,
        stage: current.stage,
        title:
          dto.kind === "cost"
            ? `Masraf: ${formatKurus(dto.amountMinor)}`
            : `Tahsilat: ${formatKurus(dto.amountMinor)}`,
        note: dto.note ?? null,
        createdBy: ctx.userId ?? null,
      });
    });

    await this.audit.record({
      action: dto.kind === "cost" ? "legal_case.cost_added" : "legal_case.collection_added",
      resource: "legal_case",
      resourceId: id,
      reason: formatKurus(dto.amountMinor),
    });

    return { ok: true };
  }

  /** Kapatma — gerekçe zorunlu ve kütüğe yazılıyor. */
  async close(id: string, dto: LegalCaseClose): Promise<{ ok: true }> {
    const ctx = this.db.ctx();

    await this.db.tx(async (tx) => {
      const current = await this.load(tx, id);
      if (current.closedAt) throw errors.validation("case_closed");

      await tx
        .update(legalCases)
        .set({ stage: "closed", closedAt: new Date() })
        .where(eq(legalCases.id, id));

      await tx.insert(legalCaseEvents).values({
        tenantId: ctx.tenantId,
        caseId: id,
        stage: "closed",
        title: "Dosya kapatıldı",
        note: dto.reason,
        createdBy: ctx.userId ?? null,
      });
    });

    await this.audit.record({
      action: "legal_case.closed",
      resource: "legal_case",
      resourceId: id,
      reason: dto.reason,
    });

    return { ok: true };
  }

  /** Dosyayı RLS kapsamında okur; başka sitenin dosyası 404. */
  private async load(
    tx: Parameters<Parameters<DbService["tx"]>[0]>[0],
    id: string,
  ): Promise<{ stage: LegalStage; closedAt: Date | null }> {
    const rows = await tx
      .select({ stage: legalCases.stage, closedAt: legalCases.closedAt })
      .from(legalCases)
      .where(eq(legalCases.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException("not_found");
    return row;
  }
}
