import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";

import {
  MEETING_NOTICE_MIN_DAYS,
  type MeetingAttendanceAdd,
  type MeetingDetail,
  type MeetingNotice,
  type MeetingStatusChange,
} from "@yonetim/contracts";
import {
  blocks,
  meetingAttendances,
  meetingDecisions,
  meetings,
  unitOccupancies,
  units,
  users,
} from "@yonetim/db";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import type { Database } from "../property/unit/types";

const DAY_MS = 86_400_000;

/**
 * Kat malikleri kurulu toplantısı — çağrı tebliği, hazirun, yeter sayı.
 *
 * KMK md.29: çağrı toplantıdan en az 15 gün önce tebliğ edilir.
 * KMK md.30: kurul kat maliklerinin **sayı ve arsa payı** çoğunluğuyla
 *   toplanır; ilk toplantıda sağlanamazsa ikinci toplantı sayının en az
 *   üçte biriyle yapılır.
 * KMK md.31: bir kişi birden çok malike vekâleten oy kullanamaz; malik
 *   sayısı yirmiden çoksa toplamın %5'ini geçmemek üzere kullanabilir.
 *
 * Bu servis hukuki karar vermiyor; yöneticinin önüne doğru sayıları ve
 * uyarıları koyuyor. Sayım bağımsız bölüm üzerinden: bir dairenin birden çok
 * maliki olsa da kurulda tek oy (arsa payı) olarak temsil ediliyor.
 */
@Injectable()
export class MeetingGovernanceService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async detail(id: string): Promise<MeetingDetail> {
    return this.db.tx(async (tx) => {
      const meeting = await this.meetingOf(tx, id);
      const [unitRows, attendanceRows, decisionRows] = await Promise.all([
        this.unitRows(tx),
        tx
          .select()
          .from(meetingAttendances)
          .where(eq(meetingAttendances.meetingId, id))
          .orderBy(asc(meetingAttendances.createdAt)),
        tx
          .select()
          .from(meetingDecisions)
          .where(eq(meetingDecisions.meetingId, id))
          .orderBy(asc(meetingDecisions.decisionNo)),
      ]);

      const labelById = new Map(unitRows.map((u) => [u.unitId, u.unitLabel] as const));
      const attendingIds = new Set(attendanceRows.map((a) => a.unitId));
      const quorum = computeQuorum(unitRows, attendanceRows);

      let noticeWarning: "missing" | "late" | null = null;
      let noticeDays: number | null = null;
      if (meeting.status !== "cancelled") {
        if (!meeting.noticeSentAt) {
          noticeWarning = "missing";
        } else {
          noticeDays = Math.floor(
            (meeting.scheduledAt.getTime() - meeting.noticeSentAt.getTime()) / DAY_MS,
          );
          if (noticeDays < MEETING_NOTICE_MIN_DAYS) noticeWarning = "late";
        }
      }

      return {
        id: meeting.id,
        title: meeting.title,
        kind: meeting.kind,
        scheduledAt: meeting.scheduledAt,
        secondCallAt: meeting.secondCallAt,
        location: meeting.location,
        onlineUrl: meeting.onlineUrl,
        agenda: Array.isArray(meeting.agenda) ? (meeting.agenda as unknown[]) : [],
        status: meeting.status,
        statusReason: meeting.statusReason,
        minutesUrl: meeting.minutesUrl,
        noticeSentAt: meeting.noticeSentAt,
        noticeMethod: meeting.noticeMethod,
        noticeWarning,
        noticeDays,
        attendances: attendanceRows.map((a) => ({
          id: a.id,
          unitId: a.unitId,
          unitLabel: labelById.get(a.unitId) ?? "—",
          ownerName: a.ownerName,
          proxyName: a.proxyName,
          proxyDocumentUrl: a.proxyDocumentUrl,
          landShare: a.landShare,
        })),
        units: unitRows.map((u) => ({
          unitId: u.unitId,
          unitLabel: u.unitLabel,
          ownerName: u.ownerName,
          landShare: u.landShare.toString(),
          attending: attendingIds.has(u.unitId),
        })),
        quorum,
        decisions: decisionRows.map((d) => ({
          id: d.id,
          meetingId: d.meetingId,
          decisionNo: d.decisionNo,
          title: d.title,
          body: d.body,
          quorumRule: d.quorumRule,
          votesFor: d.votesFor,
          votesAgainst: d.votesAgainst,
          abstentions: d.abstentions,
          passed: d.passed,
          ledgerPageNo: d.ledgerPageNo,
        })),
      };
    });
  }

  async recordNotice(id: string, dto: MeetingNotice): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const meeting = await this.meetingOf(tx, id);
      if (dto.noticeSentAt > meeting.scheduledAt)
        throw new BadRequestException("validation_failed:notice_after_meeting");
      await tx
        .update(meetings)
        .set({ noticeSentAt: dto.noticeSentAt, noticeMethod: dto.method, updatedAt: new Date() })
        .where(eq(meetings.id, id));
    });
    await this.audit.record({
      action: "meeting_notice_recorded",
      resource: "meeting",
      resourceId: id,
      diff: { noticeSentAt: { from: null, to: dto.noticeSentAt }, method: { from: null, to: dto.method } },
    });
    return { id };
  }

  async changeStatus(id: string, dto: MeetingStatusChange): Promise<{ id: string; status: string }> {
    const before = await this.db.tx(async (tx) => {
      const meeting = await this.meetingOf(tx, id);
      if (meeting.status === "cancelled")
        throw new ConflictException("conflict:meeting_cancelled");

      if (dto.status === "postponed") {
        const next = dto.newScheduledAt!;
        if (next <= meeting.scheduledAt)
          throw new BadRequestException("validation_failed:postpone_not_later");
        await tx
          .update(meetings)
          .set({
            status: "postponed",
            statusReason: dto.reason ?? null,
            scheduledAt: next,
            // Yeni tarih için çağrı yeniden tebliğ edilmeli (KMK md.29);
            // eski tebliğ yeni tarihi kapsamıyor.
            noticeSentAt: null,
            noticeMethod: null,
            secondCallAt:
              meeting.secondCallAt && meeting.secondCallAt <= next ? null : meeting.secondCallAt,
            updatedAt: new Date(),
          })
          .where(eq(meetings.id, id));
      } else {
        await tx
          .update(meetings)
          .set({ status: dto.status, statusReason: dto.reason ?? null, updatedAt: new Date() })
          .where(eq(meetings.id, id));
      }
      return meeting;
    });

    await this.audit.record({
      action: `meeting_${dto.status}`,
      resource: "meeting",
      resourceId: id,
      diff: {
        status: { from: before.status, to: dto.status },
        ...(dto.newScheduledAt
          ? { scheduledAt: { from: before.scheduledAt, to: dto.newScheduledAt } }
          : {}),
      },
      reason: dto.reason ?? undefined,
    });
    return { id, status: dto.status };
  }

  /**
   * Hazirun satırı ekle. Malik adı ve arsa payı **sunucuda** okunuyor ve
   * satırla birlikte saklanıyor: cetvel o günün fotoğrafı olmalı.
   */
  async addAttendance(meetingId: string, dto: MeetingAttendanceAdd): Promise<{ id: string }> {
    const id = await this.db.tx(async (tx) => {
      const meeting = await this.meetingOf(tx, meetingId);
      if (meeting.status === "cancelled")
        throw new ConflictException("conflict:meeting_cancelled");

      const unitRows = await this.unitRows(tx);
      const unit = unitRows.find((u) => u.unitId === dto.unitId);
      if (!unit) throw new NotFoundException("not_found");

      const attendance = await tx
        .select({ unitId: meetingAttendances.unitId, proxyName: meetingAttendances.proxyName })
        .from(meetingAttendances)
        .where(eq(meetingAttendances.meetingId, meetingId));
      if (attendance.some((a) => a.unitId === dto.unitId))
        throw new ConflictException("conflict:unit_already_attending");

      const proxy = dto.proxyName?.trim() || null;
      if (proxy) {
        const limit = proxyLimit(unitRows.length);
        const held = attendance.filter(
          (a) => a.proxyName && normalize(a.proxyName) === normalize(proxy),
        ).length;
        if (held >= limit) throw new ConflictException("conflict:proxy_limit");
      }

      const [created] = await tx
        .insert(meetingAttendances)
        .values({
          tenantId: this.db.ctx().tenantId,
          meetingId,
          unitId: dto.unitId,
          ownerName: unit.ownerName ?? unit.unitLabel,
          proxyName: proxy,
          proxyDocumentUrl: dto.proxyDocumentUrl ?? null,
          landShare: unit.landShare.toFixed(6),
          createdBy: this.db.ctx().userId ?? null,
        })
        .returning({ id: meetingAttendances.id });
      await this.syncQuorum(tx, meetingId, unitRows);
      return created!.id;
    });
    await this.audit.record({
      action: "meeting_attendance_added",
      resource: "meeting",
      resourceId: meetingId,
      diff: { unitId: { from: null, to: dto.unitId }, proxy: { from: null, to: dto.proxyName ?? null } },
    });
    return { id };
  }

  async removeAttendance(meetingId: string, attendanceId: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      await this.meetingOf(tx, meetingId);
      const removed = await tx
        .delete(meetingAttendances)
        .where(and(eq(meetingAttendances.id, attendanceId), eq(meetingAttendances.meetingId, meetingId)))
        .returning({ id: meetingAttendances.id });
      if (removed.length === 0) throw new NotFoundException("not_found");
      await this.syncQuorum(tx, meetingId, await this.unitRows(tx));
    });
    await this.audit.record({
      action: "meeting_attendance_removed",
      resource: "meeting",
      resourceId: meetingId,
      diff: { attendanceId: { from: attendanceId, to: null } },
    });
    return { id: attendanceId };
  }

  private async meetingOf(tx: Database, id: string) {
    const [meeting] = await tx
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.deletedAt)))
      .limit(1);
    if (!meeting) throw new NotFoundException("not_found");
    return meeting;
  }

  /** Daireler + aktif malik adı + arsa payı (boşsa 0). */
  private async unitRows(tx: Database) {
    const rows = await tx
      .select({
        unitId: units.id,
        number: units.number,
        blockName: blocks.name,
        landShare: units.landShare,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(units)
      .leftJoin(blocks, eq(blocks.id, units.blockId))
      .leftJoin(
        unitOccupancies,
        and(
          eq(unitOccupancies.unitId, units.id),
          eq(unitOccupancies.relation, "owner"),
          isNull(unitOccupancies.endDate),
        ),
      )
      .leftJoin(users, eq(users.id, unitOccupancies.userId))
      .where(isNull(units.deletedAt))
      .orderBy(asc(blocks.name), asc(units.number));

    // Hisseli mülkiyette birden çok malik satırı geliyor: daire başına tek
    // satır, adlar birleştirilerek.
    const byUnit = new Map<string, { unitId: string; unitLabel: string; ownerName: string | null; landShare: number }>();
    for (const r of rows) {
      const name = [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || null;
      const existing = byUnit.get(r.unitId);
      if (existing) {
        if (name) existing.ownerName = existing.ownerName ? `${existing.ownerName}, ${name}` : name;
        continue;
      }
      byUnit.set(r.unitId, {
        unitId: r.unitId,
        unitLabel: r.blockName ? `${r.blockName} / ${r.number}` : r.number,
        ownerName: name,
        landShare: Number(r.landShare ?? 0),
      });
    }
    return [...byUnit.values()];
  }

  private async syncQuorum(
    tx: Database,
    meetingId: string,
    unitRows: Awaited<ReturnType<MeetingGovernanceService["unitRows"]>>,
  ) {
    const attendance = await tx
      .select({ unitId: meetingAttendances.unitId, landShare: meetingAttendances.landShare })
      .from(meetingAttendances)
      .where(eq(meetingAttendances.meetingId, meetingId));
    const q = computeQuorum(unitRows, attendance);
    await tx
      .update(meetings)
      .set({
        attendanceShare: q.totalShare > 0 ? (q.attendingShare / q.totalShare).toFixed(4) : null,
        quorumMet: attendance.length === 0 ? null : q.firstCallMet,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));
  }
}

/** KMK md.31 — malik sayısı 20'den çoksa %5, değilse 1. */
export function proxyLimit(ownerCount: number): number {
  return ownerCount > 20 ? Math.max(1, Math.floor(ownerCount * 0.05)) : 1;
}

/**
 * Yeter sayı. Arsa payları girilmemişse (hepsi 0) pay çoğunluğu sayı
 * çoğunluğuna indirgeniyor: aksi halde hiçbir toplantı yeter sayıya
 * ulaşamazdı ve ekran yanlış "toplanamaz" derdi.
 */
export function computeQuorum(
  unitRows: { unitId: string; landShare: number }[],
  attendance: { unitId: string; landShare?: string | number }[],
) {
  const totalUnits = unitRows.length;
  const attendingUnits = attendance.length;
  const totalShare = unitRows.reduce((sum, u) => sum + u.landShare, 0);
  const shareById = new Map(unitRows.map((u) => [u.unitId, u.landShare] as const));
  const attendingShare = attendance.reduce(
    (sum, a) => sum + Number(a.landShare ?? shareById.get(a.unitId) ?? 0),
    0,
  );
  const countMajority = attendingUnits > totalUnits / 2;
  const shareMajority = totalShare > 0 ? attendingShare > totalShare / 2 : countMajority;
  return {
    totalUnits,
    attendingUnits,
    totalShare: Number(totalShare.toFixed(6)),
    attendingShare: Number(attendingShare.toFixed(6)),
    firstCallMet: totalUnits > 0 && countMajority && shareMajority,
    secondCallMet: totalUnits > 0 && attendingUnits * 3 >= totalUnits,
    proxyLimit: proxyLimit(totalUnits),
  };
}

function normalize(name: string): string {
  return name.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}
