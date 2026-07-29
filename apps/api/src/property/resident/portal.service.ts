import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";

import { maskPhone } from "@yonetim/core";
import type {
  PortalAnnouncementsResponse,
  PortalCommentCreate,
  PortalDebtsResponse,
  PortalManagement,
  PortalMessageCreate,
  PortalMessagesResponse,
  PortalPaymentsResponse,
  PortalProfile,
  PortalProfileUpdate,
  PortalRequestCreate,
  PortalRequestDetail,
  PortalRequestsResponse,
  PortalSummary,
} from "@yonetim/contracts";
import type { Database } from "@yonetim/db";
import {
  announcements,
  bankAccounts,
  blocks,
  debtChanges,
  debts,
  messages,
  payments,
  polls,
  requestComments,
  requests,
  staff,
  tenants,
  unitOccupancies,
  units,
  users,
} from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";
import { PiiService } from "./pii.service";

/**
 * Sakin self-servis portalı — SPEC Faz 2 / Bölüm 6.1, PROJE-DURUMU §5.8.
 *
 * TEK KURAL: her sorgu oturumdaki kullanıcının kendi dairesiyle sınırlıdır ve
 * bu sınır **parametreden değil bağlamdan** gelir. Hiçbir metot dışarıdan
 * `unitId` / `userId` almaz; alsaydı sakin komşusunun kimliğini yazıp onun
 * borcunu okurdu. `activeUnit()` bu yüzden tek giriş kapısı.
 *
 * Sakinin `debt:read` / `message:read` izni yok ve olmamalı: o izinler site
 * genelini açar. Portal uçları `*_own` izinleriyle korunuyor.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly db: DbService,
    private readonly pii: PiiService,
    private readonly audit: AuditService,
  ) {}

  /** Oturumdaki kullanıcı — yoksa 403. Portalın tamamı buna dayanır. */
  private userId(): string {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new ForbiddenException("user_context_required");
    return ctx.userId;
  }

  /**
   * Sakinin aktif bağımsız bölümü.
   *
   * `null` dönmesi hata değil **durum**: yeni taşınmış bir sakinin kaydı
   * yöneticiyle henüz eşleştirilmemiş olabilir. Ekranlar bunu anlatan bir
   * boş durum gösteriyor; 404 atmak kullanıcıya "sistem bozuk" dedirtirdi.
   */
  private async activeUnit(
    tx: Database,
  ): Promise<{ unitId: string; number: string; relation: string } | null> {
    const rows = await tx
      .select({
        unitId: unitOccupancies.unitId,
        number: units.number,
        relation: unitOccupancies.relation,
      })
      .from(unitOccupancies)
      .innerJoin(units, eq(units.id, unitOccupancies.unitId))
      .where(
        and(
          eq(unitOccupancies.userId, this.userId()),
          isNull(unitOccupancies.endDate),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /* ------------------------------------------------------------- özet */

  async summary(): Promise<PortalSummary> {
    const userId = this.userId();
    const ctx = this.db.ctx();

    return this.db.tx(async (tx) => {
      const tenantRows = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);
      const tenantName = tenantRows[0]?.name ?? "";

      const announcementRows = await this.recentAnnouncements(tx, 5);
      const unit = await this.activeUnit(tx);

      if (!unit) {
        return {
          tenantName,
          unit: null,
          totals: {
            outstandingMinor: 0,
            overdueMinor: 0,
            lastPaymentMinor: null,
            lastPaymentAt: null,
          },
          nextDue: null,
          openRequestCount: 0,
          unreadMessageCount: 0,
          openPollCount: 0,
          announcements: announcementRows,
        };
      }

      const openDebts = await tx
        .select()
        .from(debts)
        .where(
          and(
            eq(debts.unitId, unit.unitId),
            isNull(debts.deletedAt),
            ne(debts.status, "paid"),
          ),
        )
        .orderBy(debts.dueDate);

      const now = new Date();
      const remaining = (d: (typeof openDebts)[number]) =>
        d.amountKurus + d.lateFeeKurus - d.paidKurus;

      const outstanding = openDebts.reduce((a, d) => a + remaining(d), 0);
      const overdue = openDebts
        .filter((d) => d.dueDate < now)
        .reduce((a, d) => a + remaining(d), 0);

      const lastPayment = await tx
        .select({ amount: payments.amountKurus, paidAt: payments.paidAt })
        .from(payments)
        .where(
          and(eq(payments.unitId, unit.unitId), eq(payments.status, "completed")),
        )
        .orderBy(desc(payments.paidAt))
        .limit(1);

      const openRequests = await tx
        .select({ n: count() })
        .from(requests)
        .where(
          and(
            eq(requests.createdByUserId, userId),
            isNull(requests.deletedAt),
            inArray(requests.status, [
              "open",
              "assigned",
              "in_progress",
              "waiting_resident",
            ]),
          ),
        );

      // "Okunmadı" = yönetimden gelen (out) ve sakinin son yazışmasından
      // sonraki mesaj. Ayrı bir okundu tablosu yok; bu yaklaşım rozetin
      // amacına ("bakmam gereken bir şey var mı") yetiyor.
      const unread = await tx
        .select({ n: count() })
        .from(messages)
        .where(
          and(
            eq(messages.userId, userId),
            eq(messages.direction, "out"),
            sql`${messages.createdAt} > COALESCE((
              SELECT MAX(m2.created_at) FROM messages m2
              WHERE m2.user_id = ${userId} AND m2.direction = 'in'
            ), '-infinity'::timestamptz)`,
          ),
        );

      // Oy bekleyen anket: açık, kapanmamış ve bu dairenin oyu yok.
      const openPolls = await tx
        .select({ n: count() })
        .from(polls)
        .where(
          and(
            isNull(polls.closedAt),
            gt(polls.closesAt, now),
            sql`NOT EXISTS (
              SELECT 1 FROM poll_votes v
              WHERE v.poll_id = ${polls.id} AND v.unit_id = ${unit.unitId}
            )`,
          ),
        );

      const next = openDebts[0];

      return {
        tenantName,
        unit: { id: unit.unitId, number: unit.number, relation: unit.relation },
        totals: {
          outstandingMinor: outstanding,
          overdueMinor: overdue,
          lastPaymentMinor: lastPayment[0]?.amount ?? null,
          lastPaymentAt: lastPayment[0]?.paidAt ?? null,
        },
        nextDue: next
          ? {
              id: next.id,
              description: next.description,
              dueDate: next.dueDate,
              remainingMinor: remaining(next),
              overdue: next.dueDate < now,
            }
          : null,
        openRequestCount: Number(openRequests[0]?.n ?? 0),
        unreadMessageCount: Number(unread[0]?.n ?? 0),
        openPollCount: Number(openPolls[0]?.n ?? 0),
        announcements: announcementRows,
      };
    });
  }

  /* ------------------------------------------------------------- borç */

  async debts(): Promise<PortalDebtsResponse> {
    return this.db.tx(async (tx) => {
      const unit = await this.activeUnit(tx);
      if (!unit) {
        return {
          totals: { outstandingMinor: 0, overdueMinor: 0, lateFeeMinor: 0 },
          rows: [],
          changes: [],
        };
      }

      const rows = await tx
        .select()
        .from(debts)
        .where(and(eq(debts.unitId, unit.unitId), isNull(debts.deletedAt)))
        .orderBy(desc(debts.dueDate))
        .limit(200);

      const changes = await tx
        .select()
        .from(debtChanges)
        .where(
          and(
            eq(debtChanges.unitId, unit.unitId),
            eq(debtChanges.visibleToResident, true),
          ),
        )
        .orderBy(desc(debtChanges.createdAt))
        .limit(50);

      const now = new Date();
      const day = 24 * 60 * 60 * 1000;
      const open = rows.filter((d) => d.status !== "paid");
      const remaining = (d: (typeof rows)[number]) =>
        d.amountKurus + d.lateFeeKurus - d.paidKurus;

      return {
        totals: {
          outstandingMinor: open.reduce((a, d) => a + remaining(d), 0),
          overdueMinor: open
            .filter((d) => d.dueDate < now)
            .reduce((a, d) => a + remaining(d), 0),
          lateFeeMinor: open.reduce((a, d) => a + d.lateFeeKurus, 0),
        },
        rows: rows.map((d) => ({
          id: d.id,
          description: d.description,
          period: d.period ?? null,
          dueDate: d.dueDate,
          amountMinor: d.amountKurus,
          lateFeeMinor: d.lateFeeKurus,
          paidMinor: d.paidKurus,
          remainingMinor: remaining(d),
          status: d.status,
          overdue: d.status !== "paid" && d.dueDate < now,
          daysToDue: Math.round((d.dueDate.getTime() - now.getTime()) / day),
        })),
        changes: changes.map((c) => ({
          id: c.id,
          changeType: c.changeType,
          oldAmountMinor: Number(c.oldAmountKurus ?? 0),
          newAmountMinor: Number(c.newAmountKurus ?? 0),
          reason: c.reason,
          createdAt: c.createdAt,
        })),
      };
    });
  }

  /* ------------------------------------------------------------ ödeme */

  async payments(): Promise<PortalPaymentsResponse> {
    const userId = this.userId();

    return this.db.tx(async (tx) => {
      const unit = await this.activeUnit(tx);
      if (!unit) {
        return { totals: { thisYearMinor: 0, allTimeMinor: 0 }, rows: [] };
      }

      const payer = { firstName: users.firstName, lastName: users.lastName };
      const rows = await tx
        .select({
          id: payments.id,
          paidAt: payments.paidAt,
          amount: payments.amountKurus,
          method: payments.method,
          status: payments.status,
          receiptNo: payments.receiptNo,
          payerUserId: payments.payerUserId,
          ...payer,
        })
        .from(payments)
        .leftJoin(users, eq(users.id, payments.payerUserId))
        .where(eq(payments.unitId, unit.unitId))
        .orderBy(desc(payments.paidAt))
        .limit(200);

      const completed = rows.filter((r) => r.status === "completed");
      const yearStart = new Date(new Date().getFullYear(), 0, 1);

      return {
        totals: {
          thisYearMinor: completed
            .filter((r) => r.paidAt !== null && r.paidAt >= yearStart)
            .reduce((a, r) => a + r.amount, 0),
          allTimeMinor: completed.reduce((a, r) => a + r.amount, 0),
        },
        rows: rows.map((r) => ({
          id: r.id,
          paidAt: r.paidAt,
          amountMinor: r.amount,
          method: r.method,
          status: r.status,
          receiptNo: r.receiptNo,
          // Ödeyen sakinin kendisiyse ad göstermeye gerek yok; farklıysa
          // "kim ödedi" sorusu ekranda cevaplanmalı (kiracı ↔ malik).
          paidByName:
            r.payerUserId && r.payerUserId !== userId
              ? [r.firstName, r.lastName].filter(Boolean).join(" ") || null
              : null,
        })),
      };
    });
  }

  /* ------------------------------------------------------------ talep */

  async requests(): Promise<PortalRequestsResponse> {
    const userId = this.userId();

    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({
          id: requests.id,
          code: requests.code,
          title: requests.title,
          category: requests.category,
          status: requests.status,
          priority: requests.priority,
          createdAt: requests.createdAt,
          resolvedAt: requests.resolvedAt,
          commentCount: sql<number>`(
            SELECT COUNT(*) FROM request_comments c
            WHERE c.request_id = ${requests.id} AND c.is_internal = false
          )`,
        })
        .from(requests)
        .where(
          and(eq(requests.createdByUserId, userId), isNull(requests.deletedAt)),
        )
        .orderBy(desc(requests.createdAt))
        .limit(100);

      return { rows: rows.map((r) => ({ ...r, commentCount: Number(r.commentCount) })) };
    });
  }

  async requestDetail(id: string): Promise<PortalRequestDetail> {
    const userId = this.userId();

    return this.db.tx(async (tx) => {
      // Sahiplik `where`'in içinde: "önce çek sonra kontrol et" deseni, kaydın
      // varlığını 404/403 farkıyla sızdırır. Başkasının talebi = yok.
      const rows = await tx
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.id, id),
            eq(requests.createdByUserId, userId),
            isNull(requests.deletedAt),
          ),
        )
        .limit(1);

      const r = rows[0];
      if (!r) throw new NotFoundException("not_found");

      const comments = await tx
        .select({
          id: requestComments.id,
          body: requestComments.body,
          createdAt: requestComments.createdAt,
          userId: requestComments.userId,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(requestComments)
        .leftJoin(users, eq(users.id, requestComments.userId))
        .where(
          and(
            eq(requestComments.requestId, id),
            // Yönetimin iç notu sakine gösterilmez.
            eq(requestComments.isInternal, false),
          ),
        )
        .orderBy(requestComments.createdAt);

      return {
        id: r.id,
        code: r.code,
        title: r.title,
        category: r.category,
        status: r.status,
        priority: r.priority,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        commentCount: comments.length,
        description: r.description,
        photoUrls: Array.isArray(r.photoUrls) ? (r.photoUrls as string[]) : [],
        comments: comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt,
          mine: c.userId === userId,
          authorName:
            c.userId === userId
              ? null
              : [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
        })),
      };
    });
  }

  async createRequest(dto: PortalRequestCreate): Promise<{ id: string; code: string }> {
    const userId = this.userId();
    const ctx = this.db.ctx();

    const result = await this.db.tx(async (tx) => {
      const unit = await this.activeUnit(tx);

      // Kod sunucuda üretilir ve site içinde tekildir; istemciye bırakılsaydı
      // iki sakin aynı anda aynı kodu gönderebilirdi.
      const seq = await tx
        .select({ n: count() })
        .from(requests)
        .where(eq(requests.tenantId, ctx.tenantId));
      const code = `T-${String(Number(seq[0]?.n ?? 0) + 1).padStart(5, "0")}`;

      const inserted = await tx
        .insert(requests)
        .values({
          tenantId: ctx.tenantId,
          unitId: unit?.unitId ?? null,
          createdByUserId: userId,
          code,
          category: dto.category,
          title: dto.title,
          description: dto.description ?? null,
          priority: dto.priority,
          source: "portal",
        })
        .returning({ id: requests.id, code: requests.code });

      return inserted[0]!;
    });

    await this.audit.record({
      action: "portal.request.create",
      resource: "request",
      resourceId: result.id,
    });

    return result;
  }

  async addComment(id: string, dto: PortalCommentCreate): Promise<{ id: string }> {
    const userId = this.userId();
    const ctx = this.db.ctx();

    return this.db.tx(async (tx) => {
      const owns = await tx
        .select({ id: requests.id })
        .from(requests)
        .where(
          and(
            eq(requests.id, id),
            eq(requests.createdByUserId, userId),
            isNull(requests.deletedAt),
          ),
        )
        .limit(1);
      if (!owns[0]) throw new NotFoundException("not_found");

      const inserted = await tx
        .insert(requestComments)
        .values({
          tenantId: ctx.tenantId,
          requestId: id,
          userId,
          body: dto.body,
          // Sakinin yazdığı yorum tanım gereği iç not olamaz.
          isInternal: false,
        })
        .returning({ id: requestComments.id });

      return inserted[0]!;
    });
  }

  /* ------------------------------------------------------------ mesaj */

  async messages(): Promise<PortalMessagesResponse> {
    const userId = this.userId();

    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({
          id: messages.id,
          body: messages.body,
          channel: messages.channel,
          direction: messages.direction,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.userId, userId))
        .orderBy(messages.createdAt)
        .limit(200);

      return { rows };
    });
  }

  async sendMessage(dto: PortalMessageCreate): Promise<{ id: string }> {
    const userId = this.userId();
    const ctx = this.db.ctx();

    return this.db.tx(async (tx) => {
      const inserted = await tx
        .insert(messages)
        .values({
          tenantId: ctx.tenantId,
          userId,
          channel: "in_app",
          // `in` = sakinden yönetime. Portal yalnız bu yönü üretebilir.
          direction: "in",
          body: dto.body,
        })
        .returning({ id: messages.id });

      return inserted[0]!;
    });
  }

  /* --------------------------------------------------------- bilgiler */

  async profile(): Promise<PortalProfile> {
    const userId = this.userId();
    const ctx = this.db.ctx();

    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const u = rows[0];
      if (!u) throw new NotFoundException("not_found");

      const occupancies = await tx
        .select({
          id: units.id,
          number: units.number,
          block: blocks.name,
          relation: unitOccupancies.relation,
          startDate: unitOccupancies.startDate,
          shareRatio: unitOccupancies.ownershipPct,
        })
        .from(unitOccupancies)
        .innerJoin(units, eq(units.id, unitOccupancies.unitId))
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(
          and(
            eq(unitOccupancies.userId, userId),
            isNull(unitOccupancies.endDate),
          ),
        );

      return {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phoneMasked: u.phone ? maskPhone(u.phone) : null,
        // Kendi TCKN'si de maskeli: ham değer uçtan çıktığı anda sunucu
        // loglarına ve tarayıcı önbelleğine girer. "Kaydım doğru mu"
        // sorusuna maskeli metin zaten yetiyor.
        tcknMasked: this.pii.revealTcknMasked(u.tcknEncrypted, ctx.tenantId),
        emergencyContactName: u.emergencyContactName,
        emergencyContactPhone: u.emergencyContactPhone,
        units: occupancies,
      };
    });
  }

  async updateProfile(dto: PortalProfileUpdate): Promise<{ ok: true }> {
    const userId = this.userId();

    await this.db.tx(async (tx) => {
      await tx
        .update(users)
        .set({
          firstName: dto.firstName,
          lastName: dto.lastName,
          // Telefon burada değişmiyor: numara oturum kimliğinin kendisi
          // (OTP oraya gidiyor). Değişikliği doğrulamasız kabul etmek,
          // hesabı başka bir numaraya taşımanın kapısını açardı.
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.emergencyContactName !== undefined
            ? { emergencyContactName: dto.emergencyContactName }
            : {}),
          ...(dto.emergencyContactPhone !== undefined
            ? { emergencyContactPhone: dto.emergencyContactPhone }
            : {}),
        })
        .where(eq(users.id, userId));
    });

    await this.audit.record({
      action: "portal.profile.update",
      resource: "user",
      resourceId: userId,
    });

    return { ok: true };
  }

  /* ---------------------------------------------------- yönetim bilgisi */

  async management(): Promise<PortalManagement> {
    const ctx = this.db.ctx();

    return this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);
      const t = rows[0];
      if (!t) throw new NotFoundException("not_found");

      const manager = t.managerId
        ? (
            await tx
              .select({
                firstName: users.firstName,
                lastName: users.lastName,
                phone: users.phone,
                email: users.email,
              })
              .from(users)
              .where(eq(users.id, t.managerId))
              .limit(1)
          )[0]
        : undefined;

      const accounts = await tx
        .select({
          id: bankAccounts.id,
          bankName: bankAccounts.bankName,
          accountName: bankAccounts.accountName,
          ibanMasked: bankAccounts.ibanMasked,
        })
        .from(bankAccounts)
        .where(
          and(
            isNull(bankAccounts.deletedAt),
            eq(bankAccounts.isActive, true),
            eq(bankAccounts.purpose, "dues"),
          ),
        );

      const staffRows = await tx
        .select({
          id: staff.id,
          name: staff.fullName,
          role: staff.role,
          phone: staff.phone,
        })
        .from(staff)
        .where(isNull(staff.endedAt));

      return {
        tenantName: t.name,
        tenantType: t.type,
        address:
          [t.neighborhood, t.district, t.city].filter(Boolean).join(", ") || null,
        managerName:
          manager && [manager.firstName, manager.lastName].filter(Boolean).length
            ? [manager.firstName, manager.lastName].filter(Boolean).join(" ")
            : null,
        // Yöneticinin iletişim bilgisi KMK md.34 gereği kat maliklerine açık;
        // bu yüzden maskelenmiyor.
        managerPhone: manager?.phone ?? null,
        managerEmail: manager?.email ?? null,
        bankAccounts: accounts.map((a) => ({
          id: a.id,
          label: a.accountName ?? a.bankName,
          bankName: a.bankName,
          ibanMasked: a.ibanMasked,
        })),
        staff: staffRows,
      };
    });
  }

  /* --------------------------------------------------------- duyurular */

  async announcements(): Promise<PortalAnnouncementsResponse> {
    return this.db.tx(async (tx) => ({
      rows: await this.recentAnnouncements(tx, 50),
    }));
  }

  /** Yayınlanmış ve süresi dolmamış duyurular — özet ve liste ortak kullanır. */
  private async recentAnnouncements(tx: Database, limit: number) {
    const now = new Date();
    const rows = await tx
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        category: announcements.audience,
        urgent: announcements.isUrgent,
        publishedAt: announcements.publishedAt,
        expiresAt: announcements.expiresAt,
      })
      .from(announcements)
      .where(
        and(
          isNull(announcements.deletedAt),
          sql`${announcements.publishedAt} IS NOT NULL`,
          sql`${announcements.publishedAt} <= ${now}`,
        ),
      )
      .orderBy(desc(announcements.publishedAt))
      .limit(limit);

    // Süresi dolmuş duyuru listede durmasın; SQL'de değil burada eleniyor
    // çünkü `expires_at` null olabiliyor ve iki ayrı koşul okunurluğu bozuyordu.
    return rows
      .filter((r) => !r.expiresAt || r.expiresAt > now)
      .map(({ expiresAt: _drop, ...rest }) => rest);
  }
}
