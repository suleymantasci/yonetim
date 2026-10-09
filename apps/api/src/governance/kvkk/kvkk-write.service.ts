import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, isNull, ne, sql, notInArray } from "drizzle-orm";

import type {
  DataBreachCreate,
  DataBreachList,
  DataBreachUpdate,
  KvkkErasureResult,
  KvkkOwnRequestCreate,
  KvkkOwnRequestList,
  KvkkRequestCreate,
  KvkkRequestUpdate,
} from "@yonetim/contracts";
import {
  conversationStates,
  dataBreaches,
  debts,
  kvkkRequests,
  memberships,
  messages,
  sessions,
  userAddresses,
  users,
} from "@yonetim/db";
import { BREACH_BOARD_NOTICE_HOURS, dueDateFor, legalDueDateFor } from "@yonetim/kvkk";

import { AuditService } from "../audit/audit.service";
import { DbService } from "../../infra/db/db.service";

const HOUR_MS = 3_600_000;

/**
 * KVKK yazma yolları — başvuru (md.11/13), silme (md.7), ihlal (md.12/5).
 *
 * KVKK modülü bugüne kadar salt okunurdu: başvuru tablosu ve ihlal tablosu
 * vardı ama kayıt açan, sonuçlandıran ya da silme talebini uygulayan yol
 * yoktu. Yönetici yükümlülüğü yerine getirdiğini ancak kağıt üzerinde
 * gösterebiliyordu.
 *
 * Kişisel veri denetim kütüğüne YAZILMIYOR: kütük kaydı "hangi başvuru,
 * hangi işlem" der; kişinin adı/iletişimi kütüğe kopyalanırsa silme talebi
 * kütükte iz bırakmış olurdu.
 */
@Injectable()
export class KvkkWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------ başvuru */

  async createRequest(dto: KvkkRequestCreate): Promise<{ id: string }> {
    const ctx = this.db.ctx();
    const receivedAt = dto.receivedAt ?? new Date();
    if (receivedAt.getTime() > Date.now() + 60_000)
      throw new BadRequestException("validation_failed:received_in_future");

    const id = await this.db.tx(async (tx) => {
      if (dto.userId) {
        // Başvuran bu sitenin (geçmiş ya da bugünkü) üyesi olmalı: başka bir
        // sitenin sakini adına burada kayıt açılmasın.
        const [member] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(eq(memberships.userId, dto.userId))
          .limit(1);
        if (!member) throw new NotFoundException("not_found:subject");
      }
      const [row] = await tx
        .insert(kvkkRequests)
        .values({
          tenantId: ctx.tenantId,
          userId: dto.userId ?? null,
          requesterEmail: dto.requesterEmail ?? null,
          type: dto.type,
          detail: dto.detail,
          dueAt: dueDateFor(dto.type, receivedAt),
          createdAt: receivedAt,
        })
        .returning({ id: kvkkRequests.id });
      return row!.id;
    });

    await this.audit.record({
      action: "kvkk_request_created",
      resource: "kvkk_request",
      resourceId: id,
      reason: dto.type,
    });
    return { id };
  }

  /**
   * Sakinin kendi başvurusu. Kimlik oturumdan; başkası adına başvuru bu
   * yoldan açılamıyor. Aynı türde açık başvurusu varsa yenisi açılmıyor —
   * çift kayıt yöneticinin süre takibini bulandırırdı.
   */
  async createOwnRequest(dto: KvkkOwnRequestCreate): Promise<{ id: string }> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new NotFoundException("user_context_required");
    const userId = ctx.userId;
    const now = new Date();
    const id = await this.db.tx(async (tx) => {
      const [open] = await tx
        .select({ id: kvkkRequests.id })
        .from(kvkkRequests)
        .where(
          and(
            eq(kvkkRequests.userId, userId),
            eq(kvkkRequests.type, dto.type),
            sql`${kvkkRequests.status} IN ('received', 'in_progress')`,
          ),
        )
        .limit(1);
      if (open) throw new ConflictException("conflict:kvkk_request_already_open");
      const [row] = await tx
        .insert(kvkkRequests)
        .values({
          tenantId: ctx.tenantId,
          userId,
          type: dto.type,
          detail: dto.detail,
          dueAt: dueDateFor(dto.type, now),
        })
        .returning({ id: kvkkRequests.id });
      return row!.id;
    });
    await this.audit.record({
      action: "kvkk_request_created",
      resource: "kvkk_request",
      resourceId: id,
      reason: `self:${dto.type}`,
    });
    return { id };
  }

  async listOwnRequests(): Promise<KvkkOwnRequestList> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new NotFoundException("user_context_required");
    const userId = ctx.userId;
    const rows = await this.db.tx((tx) =>
      tx
        .select()
        .from(kvkkRequests)
        .where(eq(kvkkRequests.userId, userId))
        .orderBy(desc(kvkkRequests.createdAt))
        .limit(50),
    );
    return {
      rows: rows.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        detail: r.detail,
        responseNote: r.responseNote,
        legalDueAt: legalDueDateFor(r.createdAt),
        fulfilledAt: r.fulfilledAt,
        createdAt: r.createdAt,
      })),
    };
  }

  async updateRequest(id: string, dto: KvkkRequestUpdate): Promise<{ id: string; status: string }> {
    const ctx = this.db.ctx();
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ status: kvkkRequests.status, type: kvkkRequests.type })
        .from(kvkkRequests)
        .where(eq(kvkkRequests.id, id))
        .for("update");
      if (!row) throw new NotFoundException("not_found");
      if (row.status === "fulfilled" || row.status === "rejected")
        throw new ConflictException("conflict:kvkk_request_closed");
      // Silme talebi "tamamlandı" diye kapatılamaz: silme işlemi ayrı uçta
      // gerçekten yapılıyor. Elle kapatmak, veriyi silmeden "sildik" demek olurdu.
      if (row.type === "erasure" && dto.status === "fulfilled")
        throw new ConflictException("conflict:erasure_requires_erase_action");

      await tx
        .update(kvkkRequests)
        .set({
          status: dto.status,
          responseNote: dto.responseNote,
          handledBy: ctx.userId ?? null,
          fulfilledAt: dto.status === "fulfilled" ? new Date() : null,
        })
        .where(eq(kvkkRequests.id, id));
    });

    await this.audit.record({
      action: `kvkk_request_${dto.status}`,
      resource: "kvkk_request",
      resourceId: id,
      reason: dto.responseNote,
    });
    return { id, status: dto.status };
  }

  /**
   * Silme talebini uygular — kişiyi anonimleştirir.
   *
   * KİMİ SİLMİYORUZ: mali kayıtlar (borç, ödeme, fatura) VUK md.253 gereği
   * 5 yıl, karar defteri süresiz saklanıyor (`planErasure`). Bu kayıtlar
   * kişiye `user_id` ile bağlı kalıyor ama kişinin kimliği (ad, iletişim,
   * TCKN, sağlık verisi) anonimleşiyor — kayıt kalır, kişi tanınmaz.
   *
   * ÖN KOŞULLAR (sırasıyla, hepsi ret sebebi):
   * - Başvuru `erasure` türünde ve açık.
   * - Kişi bu sitede hâlâ üye değil — önce "siteden çıkar" (o akış açık
   *   borcu olanı zaten çıkarmıyor).
   * - Bu sitede ödenmemiş borcu yok.
   * - Başka bir sitede aktif üyeliği yok: `users` kaydı siteler arası ortak;
   *   orada sakin olmaya devam eden birinin kimliğini silmek o sitenin
   *   verisini bozar. Bu durumda yalnız bu sitedeki veriler silinebilir.
   */
  async erase(requestId: string, responseNote: string): Promise<KvkkErasureResult> {
    const ctx = this.db.ctx();
    const anonymizedAt = new Date();

    // Sıra önemli: başvuru ancak kimlik gerçekten anonimleştikten SONRA
    // "tamamlandı" olur. Aksi hâlde başka sitedeki aktif üyelik yüzünden
    // yarıda kalan silme, kapanmış bir başvuru gibi görünürdü.
    await this.assertNotActiveElsewhere(requestId);

    const userId = await this.db.tx(async (tx) => {
      const [request] = await tx
        .select({ type: kvkkRequests.type, status: kvkkRequests.status, userId: kvkkRequests.userId })
        .from(kvkkRequests)
        .where(eq(kvkkRequests.id, requestId))
        .for("update");
      if (!request) throw new NotFoundException("not_found");
      if (request.type !== "erasure") throw new ConflictException("conflict:not_erasure_request");
      if (request.status === "fulfilled" || request.status === "rejected")
        throw new ConflictException("conflict:kvkk_request_closed");
      if (!request.userId) throw new ConflictException("conflict:erasure_subject_unknown");
      const subjectId = request.userId;

      const [active] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.userId, subjectId), isNull(memberships.deletedAt)))
        .limit(1);
      if (active) throw new ConflictException("conflict:erasure_subject_still_member");

      const [openDebt] = await tx
        .select({ id: debts.id })
        .from(debts)
        .where(
          and(eq(debts.debtorUserId, subjectId), isNull(debts.deletedAt), notInArray(debts.status, ["paid", "written_off", "cancelled"])),
        )
        .limit(1);
      if (openDebt) throw new ConflictException("conflict:erasure_open_debts");

      // Bu sitedeki yazışma içerikleri — mesaj kaydı (tarih, kanal) kalır,
      // içerik gider (`planErasure.deletable: messages.body`).
      await tx
        .update(messages)
        .set({ body: null, mediaUrl: null })
        .where(eq(messages.userId, subjectId));
      await tx.delete(conversationStates).where(eq(conversationStates.userId, subjectId));

      return subjectId;
    });

    // Kimlik siteler arası ortak tabloda: RLS'in dışında, ama yalnız başka
    // hiçbir sitede aktif üyeliği olmayan kişi için.
    await this.db.bypass("kvkk:erase-identity", async (tx) => {
      const [elsewhere] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), isNull(memberships.deletedAt)))
        .limit(1);
      if (elsewhere) throw new ConflictException("conflict:erasure_subject_active_elsewhere");

      await tx
        .update(users)
        .set({
          firstName: "Anonim",
          lastName: `Kişi ${userId.slice(0, 8)}`,
          email: null,
          emailVerifiedAt: null,
          phone: null,
          phoneVerifiedAt: null,
          phoneEncrypted: null,
          phoneIndex: null,
          passwordHash: null,
          tcknEncrypted: null,
          tcknIndex: null,
          avatarUrl: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          emergencyContactPhoneEncrypted: null,
          emergencyContactPhoneIndex: null,
          bloodType: null,
          twoFactorSecretEncrypted: null,
          twoFactorEnabled: false,
          whatsappOptIn: false,
          anonymizedAt,
          deletedAt: anonymizedAt,
        })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.delete(userAddresses).where(eq(userAddresses.userId, userId));
    });

    await this.db.tx((tx) =>
      tx
        .update(kvkkRequests)
        .set({
          status: "fulfilled",
          fulfilledAt: anonymizedAt,
          responseNote,
          handledBy: ctx.userId ?? null,
        })
        .where(eq(kvkkRequests.id, requestId)),
    );

    await this.audit.record({
      action: "kvkk_erasure_applied",
      resource: "kvkk_request",
      resourceId: requestId,
      reason: responseNote,
    });
    return { requestId, userId, anonymizedAt };
  }

  /**
   * Başka bir sitede aktif üyelik var mı — silmeye başlamadan önce.
   * Bu sitedeki üyelik ayrıca (RLS altında) "önce siteden çıkar" olarak
   * reddediliyor; burada yalnız diğer siteler soruluyor.
   */
  private async assertNotActiveElsewhere(requestId: string): Promise<void> {
    const ctx = this.db.ctx();
    const [request] = await this.db.tx((tx) =>
      tx.select({ userId: kvkkRequests.userId }).from(kvkkRequests).where(eq(kvkkRequests.id, requestId)),
    );
    if (!request?.userId) return; // asıl ret sebebi aşağıda üretiliyor
    const subjectId = request.userId;
    await this.db.bypass("kvkk:erase-precheck", async (tx) => {
      const [elsewhere] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, subjectId),
            isNull(memberships.deletedAt),
            ne(memberships.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);
      if (elsewhere) throw new ConflictException("conflict:erasure_subject_active_elsewhere");
    });
  }

  /* --------------------------------------------------------------- ihlal */

  async listBreaches(): Promise<DataBreachList> {
    const rows = await this.db.tx((tx) =>
      tx.select().from(dataBreaches).orderBy(desc(dataBreaches.detectedAt)).limit(100),
    );
    const now = Date.now();
    return {
      rows: rows.map((row) => {
        const boardDeadlineAt = new Date(row.detectedAt.getTime() + BREACH_BOARD_NOTICE_HOURS * HOUR_MS);
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          detectedAt: row.detectedAt,
          affectedUserCount: row.affectedUserCount,
          dataCategories: Array.isArray(row.dataCategories) ? (row.dataCategories as string[]) : [],
          boardNotifiedAt: row.boardNotifiedAt,
          subjectsNotifiedAt: row.subjectsNotifiedAt,
          mitigation: row.mitigation,
          status: row.status,
          boardDeadlineAt,
          boardOverdue: !row.boardNotifiedAt && boardDeadlineAt.getTime() < now,
        };
      }),
    };
  }

  async createBreach(dto: DataBreachCreate): Promise<{ id: string }> {
    const ctx = this.db.ctx();
    if (dto.detectedAt.getTime() > Date.now() + 60_000)
      throw new BadRequestException("validation_failed:detected_in_future");
    const [row] = await this.db.tx((tx) =>
      tx
        .insert(dataBreaches)
        .values({
          tenantId: ctx.tenantId,
          title: dto.title,
          description: dto.description,
          detectedAt: dto.detectedAt,
          affectedUserCount: dto.affectedUserCount,
          dataCategories: dto.dataCategories,
        })
        .returning({ id: dataBreaches.id }),
    );
    await this.audit.record({ action: "data_breach_recorded", resource: "data_breach", resourceId: row!.id });
    return { id: row!.id };
  }

  async updateBreach(id: string, dto: DataBreachUpdate): Promise<{ id: string }> {
    const updated = await this.db.tx((tx) =>
      tx
        .update(dataBreaches)
        .set({
          ...(dto.boardNotifiedAt !== undefined ? { boardNotifiedAt: dto.boardNotifiedAt } : {}),
          ...(dto.subjectsNotifiedAt !== undefined ? { subjectsNotifiedAt: dto.subjectsNotifiedAt } : {}),
          ...(dto.mitigation !== undefined ? { mitigation: dto.mitigation } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          updatedAt: sql`now()`,
        })
        .where(eq(dataBreaches.id, id))
        .returning({ id: dataBreaches.id }),
    );
    if (updated.length === 0) throw new NotFoundException("not_found");
    await this.audit.record({ action: "data_breach_updated", resource: "data_breach", resourceId: id });
    return { id };
  }
}
