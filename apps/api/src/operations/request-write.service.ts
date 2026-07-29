import { Injectable, NotFoundException } from "@nestjs/common";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import type {
  RequestAssignPatch,
  RequestCommentCreate,
  RequestDetail,
  RequestSave,
  RequestSaveResult,
  RequestStatusPatch,
} from "@yonetim/contracts";
import { requestComments, requests } from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import { OperationsRepository } from "./operations.repository";

/**
 * Durum → zaman damgası eşlemesi.
 *
 * Kapanış zamanları formun kaydettiği alanlar değil, **geçişin ürettiği
 * izler**: kullanıcıya "çözüm tarihi" diye bir alan sorulsaydı, geçmişe
 * dönük tarih girip SLA ölçümünü anlamsızlaştırmak mümkün olurdu.
 */
const CLOSING_STATUSES = new Set(["resolved", "closed", "rejected"]);

/**
 * Talep/arıza yazma — PROJE-DURUMU §5.2, sıra 2.
 *
 * Bu modülde okuma tarafı zaten SLA'yı hesaplıyordu ama besleyecek kayıt
 * üretilemiyordu: `request:write` ve `request:assign` yetkileri tanımlıydı,
 * hiçbir uçta kullanılmıyordu.
 *
 * KOD VE SLA VADESİ SUNUCUDA (sözleşmede gerekçesi yazılı): kod site içinde
 * tekil olmalı, vade ise `siteConfig.sla`'daki söze ve **sunucunun saatine**
 * bağlı.
 */
@Injectable()
export class RequestWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly repo: OperationsRepository,
  ) {}

  async detail(id: string): Promise<RequestDetail> {
    const row = await this.repo.requestDetail(id);
    if (!row) throw new NotFoundException("not_found");

    const r = row.request;
    return {
      id: r.id,
      code: r.code,
      unitId: r.unitId,
      unitNumber: row.unitNumber,
      category: r.category as RequestDetail["category"],
      title: r.title,
      description: r.description,
      priority: r.priority,
      status: r.status,
      assignedToUserId: r.assignedToUserId,
      assignedToName: fullName(row.assignedFirstName, row.assignedLastName),
      slaDueAt: r.slaDueAt,
      // Okuma ucuyla **aynı** kural: vadesi geçmiş ve henüz çözülmemiş.
      slaBreached: Boolean(
        r.slaDueAt && r.slaDueAt.getTime() < Date.now() && !r.resolvedAt,
      ),
      firstResponseAt: r.firstResponseAt,
      resolvedAt: r.resolvedAt,
      closedAt: r.closedAt,
      costMinor: r.costKurus,
      createdAt: r.createdAt,
      comments: row.comments.map((c) => ({
        id: c.id,
        body: c.body,
        isInternal: c.isInternal,
        authorName: fullName(c.firstName, c.lastName),
        createdAt: c.createdAt,
      })),
    };
  }

  /** `id` yoksa oluşturur, varsa günceller. */
  async save(dto: RequestSave, id?: string): Promise<RequestSaveResult> {
    const tenantId = this.db.ctx().tenantId;

    const base = {
      unitId: dto.unitId ?? null,
      category: dto.category,
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority,
      assignedToUserId: dto.assignedToUserId ?? null,
      costKurus: dto.costMinor,
    };

    const result = await this.db.tx(async (tx) => {
      if (!id) {
        const code = await this.nextCode(tx);
        const [created] = await tx
          .insert(requests)
          .values({
            ...base,
            tenantId,
            code,
            // Atanmışsa durum "açık" değil "atandı": iki alanın çelişmesi,
            // "kimse bakmıyor" filtresini yanlış doldururdu.
            status: base.assignedToUserId ? "assigned" : "open",
            slaDueAt: slaDueFor(dto.priority),
            createdByUserId: this.db.ctx().userId ?? null,
            source: "panel",
          })
          .returning({ id: requests.id, code: requests.code });
        if (!created) throw new NotFoundException("internal");
        return { ...created, diff: undefined };
      }

      const [before] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.id, id), isNull(requests.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      /*
       * ÖNCELİK DEĞİŞİRSE SLA VADESİ YENİDEN HESAPLANIYOR — ama **açılış
       * anından** itibaren, "şimdi"den değil. Aksi hâlde geciken bir talebin
       * önceliğini yükseltmek vadeyi ileri atar ve gecikmeyi silerdi;
       * önceliği yükseltmenin cezası olmamalı ama ödülü de olmamalı.
       */
      const slaDueAt =
        before.priority === dto.priority
          ? before.slaDueAt
          : slaDueFor(dto.priority, before.createdAt);

      await tx
        .update(requests)
        .set({ ...base, slaDueAt, updatedAt: new Date() })
        .where(eq(requests.id, id));

      return {
        id,
        code: before.code,
        diff: diffOf(before as unknown as Record<string, unknown>, {
          ...base,
          slaDueAt,
        }),
      };
    });

    await this.audit.record({
      action: id ? "request_updated" : "request_created",
      resource: "request",
      resourceId: result.id,
      diff: result.diff,
    });
    return { id: result.id, code: result.code };
  }

  /**
   * Durum geçişi.
   *
   * `firstResponseAt` ilk kez "açık"tan çıkıldığında yazılıyor ve bir daha
   * değişmiyor: ilk yanıt süresi tanımı gereği bir kez ölçülür.
   */
  async setStatus(id: string, dto: RequestStatusPatch): Promise<{ id: string }> {
    const now = new Date();

    await this.db.tx(async (tx) => {
      const [before] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.id, id), isNull(requests.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      const closing = CLOSING_STATUSES.has(dto.status);
      await tx
        .update(requests)
        .set({
          status: dto.status,
          firstResponseAt:
            before.firstResponseAt ?? (dto.status === "open" ? null : now),
          // `resolved` çözüm, `closed`/`rejected` kapanış. Reddedilen talep
          // "çözülmüş" sayılmıyor — ortalama çözüm süresini bozardı.
          resolvedAt:
            dto.status === "resolved" ? (before.resolvedAt ?? now) : before.resolvedAt,
          closedAt: closing ? (before.closedAt ?? now) : null,
          updatedAt: now,
        })
        .where(eq(requests.id, id));

      /*
       * Çözüm notu ayrı bir kolona değil **yorum akışına** yazılıyor: "ne
       * yapıldı" sorusunun cevabı, konuşmanın geri kalanıyla aynı yerde ve
       * aynı zaman sırasında durmalı. İç not değil — sakin de görebilmeli.
       */
      if (dto.resolutionNote) {
        await tx.insert(requestComments).values({
          tenantId: this.db.ctx().tenantId,
          requestId: id,
          userId: this.db.ctx().userId ?? null,
          body: dto.resolutionNote,
          isInternal: false,
        });
      }
    });

    await this.audit.record({
      action: "request_status_changed",
      resource: "request",
      resourceId: id,
      diff: { status: { from: null, to: dto.status } },
    });
    return { id };
  }

  /** Atama — `null` atamayı kaldırır ve durumu "açık"a döndürür. */
  async assign(id: string, dto: RequestAssignPatch): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [before] = await tx
        .select({ id: requests.id, status: requests.status })
        .from(requests)
        .where(and(eq(requests.id, id), isNull(requests.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      /*
       * Durum yalnız **iki uçta** oynatılıyor: atanmamışken atandı, ya da
       * atanmışken geri alındı. Devam eden/çözülen bir talebin durumu atama
       * değişikliğiyle geri sarılmıyor — görevli değişikliği ilerlemeyi
       * silmez.
       */
      const status =
        dto.assignedToUserId && before.status === "open"
          ? "assigned"
          : !dto.assignedToUserId && before.status === "assigned"
            ? "open"
            : before.status;

      await tx
        .update(requests)
        .set({
          assignedToUserId: dto.assignedToUserId ?? null,
          status,
          updatedAt: new Date(),
        })
        .where(eq(requests.id, id));
    });

    await this.audit.record({
      action: "request_assigned",
      resource: "request",
      resourceId: id,
      diff: {
        assignedToUserId: { from: null, to: dto.assignedToUserId ?? null },
      },
    });
    return { id };
  }

  async addComment(
    id: string,
    dto: RequestCommentCreate,
  ): Promise<{ id: string }> {
    const commentId = await this.db.tx(async (tx) => {
      const [exists] = await tx
        .select({ id: requests.id })
        .from(requests)
        .where(and(eq(requests.id, id), isNull(requests.deletedAt)))
        .limit(1);
      if (!exists) throw new NotFoundException("not_found");

      const [created] = await tx
        .insert(requestComments)
        .values({
          tenantId: this.db.ctx().tenantId,
          requestId: id,
          userId: this.db.ctx().userId ?? null,
          body: dto.body,
          isInternal: dto.isInternal,
        })
        .returning({ id: requestComments.id });
      if (!created) throw new NotFoundException("internal");
      return created.id;
    });

    await this.audit.record({
      action: "request_commented",
      resource: "request",
      resourceId: id,
    });
    return { id: commentId };
  }

  /**
   * Sıradaki talep kodu — `TLP-2026-0001`.
   *
   * Yıl başına sıfırlanıyor ve sayaç **o yılın** kayıt sayısından türüyor.
   * Çakışma tekil index'e takılır (`idx_requests_tenant_code`); bu, eş
   * zamanlı iki kayıtta ikincisinin hata almasına yol açar — nadir ve
   * görünür bir sonuç, sessizce aynı numarayı vermekten iyi.
   */
  private async nextCode(tx: Parameters<Parameters<DbService["tx"]>[0]>[0]) {
    const year = new Date().getFullYear();
    const [row] = await tx
      .select({ value: count() })
      .from(requests)
      .where(sql`date_part('year', ${requests.createdAt}) = ${year}`);
    return `TLP-${year}-${String((row?.value ?? 0) + 1).padStart(4, "0")}`;
  }
}

function fullName(first?: string | null, last?: string | null): string | null {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || null;
}

/**
 * SLA vadesi — `siteConfig.sla` içindeki söz.
 *
 * `from` verilmezse "şimdi": yeni talebin sayacı açılış anından işler.
 * Verilirse (öncelik değişikliği) sayaç **açılış anından** yeniden kurulur.
 */
function slaDueFor(priority: keyof typeof siteConfig.sla, from?: Date): Date {
  const base = from ?? new Date();
  return new Date(base.getTime() + siteConfig.sla[priority].hours * 3_600_000);
}
