import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { maskPhone, normalizePhone } from "@yonetim/core";
import { TEAM_ROLES, type TeamInvite, type TeamList, type TeamRolePatch } from "@yonetim/contracts";
import { memberships, users } from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/** Listede görünen panel rolleri; şirket rolleri gösterilir ama değiştirilemez. */
const LISTED = [...TEAM_ROLES, "company_admin", "company_operator"] as const;

/**
 * Program kullanıcıları — davet, rol değişikliği, erişimi kaldırma.
 *
 * Güvenlik kuralları:
 *  - kişi kendi rolünü değiştiremez ve kendi erişimini kaldıramaz;
 *  - sitenin **son** yöneticisi düşürülemez/kaldırılamaz (panel sahipsiz kalır);
 *  - şirket rolleri (company_*) bu ekrandan yönetilmez.
 */
@Injectable()
export class TeamService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TeamList> {
    const me = this.db.ctx().userId;
    const rows = await this.db.tx((tx) =>
      tx
        .select({
          membershipId: memberships.id,
          userId: memberships.userId,
          role: memberships.role,
          invitedAt: memberships.invitedAt,
        })
        .from(memberships)
        .where(and(isNull(memberships.deletedAt), inArray(memberships.role, [...LISTED]))),
    );
    if (rows.length === 0) return { rows: [] };
    const people = await this.db.bypass("team:people", (tx) =>
      tx
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          email: users.email,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .where(inArray(users.id, [...new Set(rows.map((r) => r.userId))])),
    );
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      rows: rows
        .map((r) => {
          const p = byId.get(r.userId);
          const isSelf = r.userId === me;
          return {
            membershipId: r.membershipId,
            userId: r.userId,
            name: [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "—",
            role: r.role,
            editable: !isSelf && (TEAM_ROLES as readonly string[]).includes(r.role),
            isSelf,
            phoneMasked: p?.phone ? maskPhone(p.phone) : null,
            email: p?.email ?? null,
            invitedAt: r.invitedAt,
            lastLoginAt: p?.lastLoginAt ?? null,
          };
        })
        .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name, "tr")),
    };
  }

  async invite(dto: TeamInvite): Promise<{ membershipId: string; linkedExisting: boolean }> {
    const ctx = this.db.ctx();
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (dto.phone && !phone) throw new BadRequestException("validation_failed:phone");
    const email = dto.email?.toLowerCase() ?? null;

    const { userId, linkedExisting } = await this.db.bypass("team:invite-user", async (tx) => {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(isNull(users.deletedAt), phone ? eq(users.phone, phone) : eq(users.email, email!)))
        .limit(1);
      if (existing) return { userId: existing.id, linkedExisting: true };
      const [created] = await tx
        .insert(users)
        .values({ firstName: dto.firstName, lastName: dto.lastName, phone, email, locale: "tr" })
        .returning({ id: users.id });
      return { userId: created!.id, linkedExisting: false };
    });

    const membershipId = await this.db.tx(async (tx) => {
      const [active] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.role, dto.role), isNull(memberships.deletedAt)))
        .limit(1);
      if (active) throw new ConflictException("conflict:member_exists");
      // Tekil index silinmiş satırı da kapsıyor: önceden kaldırılan kişi geri gelir.
      const [row] = await tx
        .insert(memberships)
        .values({
          tenantId: ctx.tenantId,
          userId,
          role: dto.role,
          invitedBy: ctx.userId,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [memberships.tenantId, memberships.userId, memberships.role],
          set: { deletedAt: null, invitedBy: ctx.userId, invitedAt: new Date(), updatedAt: new Date() },
        })
        .returning({ id: memberships.id });
      return row!.id;
    });

    await this.audit.record({
      action: "team_member_invited",
      resource: "membership",
      resourceId: membershipId,
      diff: { role: { from: null, to: dto.role }, userId: { from: null, to: userId } },
    });
    return { membershipId, linkedExisting };
  }

  async changeRole(membershipId: string, dto: TeamRolePatch): Promise<{ membershipId: string }> {
    const before = await this.editable(membershipId);
    if (before.role === dto.role) return { membershipId };
    const id = await this.db.tx(async (tx) => {
      if (before.role === "manager") await this.assertNotLastManager(tx, membershipId);
      await tx.update(memberships).set({ deletedAt: new Date() }).where(eq(memberships.id, membershipId));
      const [row] = await tx
        .insert(memberships)
        .values({
          tenantId: this.db.ctx().tenantId,
          userId: before.userId,
          role: dto.role,
          invitedBy: this.db.ctx().userId,
          invitedAt: new Date(),
          acceptedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [memberships.tenantId, memberships.userId, memberships.role],
          set: { deletedAt: null, updatedAt: new Date() },
        })
        .returning({ id: memberships.id });
      return row!.id;
    });
    await this.audit.record({
      action: "team_member_role_changed",
      resource: "membership",
      resourceId: id,
      diff: { role: { from: before.role, to: dto.role } },
    });
    return { membershipId: id };
  }

  async remove(membershipId: string): Promise<{ membershipId: string }> {
    const before = await this.editable(membershipId);
    await this.db.tx(async (tx) => {
      if (before.role === "manager") await this.assertNotLastManager(tx, membershipId);
      await tx.update(memberships).set({ deletedAt: new Date() }).where(eq(memberships.id, membershipId));
    });
    await this.audit.record({
      action: "team_member_removed",
      resource: "membership",
      resourceId: membershipId,
      diff: { role: { from: before.role, to: null } },
    });
    return { membershipId };
  }

  private async editable(membershipId: string) {
    const [row] = await this.db.tx((tx) =>
      tx
        .select({ userId: memberships.userId, role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.id, membershipId), isNull(memberships.deletedAt)))
        .limit(1),
    );
    if (!row || !(TEAM_ROLES as readonly string[]).includes(row.role)) throw new NotFoundException("not_found");
    if (row.userId === this.db.ctx().userId) throw new ConflictException("conflict:team_self");
    return row;
  }

  private async assertNotLastManager(tx: Parameters<Parameters<DbService["tx"]>[0]>[0], exceptId: string) {
    const [other] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.role, "manager"), isNull(memberships.deletedAt), ne(memberships.id, exceptId)))
      .limit(1);
    if (!other) throw new ConflictException("conflict:last_manager");
  }
}
