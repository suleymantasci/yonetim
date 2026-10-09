import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";

import { createSession, SESSION_COOKIE } from "@yonetim/auth";
import {
  blocks,
  memberships,
  sessions,
  tenants,
  unitOccupancies,
  units,
  users,
  withBypassRls,
} from "@yonetim/db";

/**
 * Entegrasyon testleri için tek kullanımlık site: bir blok, `unitCount` daire
 * (her birinde bir malik; ilk dairede ayrıca kiracı), bir yönetici. Temizlik
 * siteyi siler (tenant_id FK'leri cascade) ve test kullanıcılarını kaldırır.
 */
export const BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3100";
const PANEL_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

export const apiReachable = await fetch(`${BASE}/health`)
  .then((r) => r.ok)
  .catch(() => false);

export interface TestSite {
  tenantId: string;
  slug: string;
  managerId: string;
  unitIds: string[];
  ownerIds: string[];
  tenantResidentId: string;
  managerCookie: string;
  ownerCookie: string;
  call: (
    method: string,
    path: string,
    body?: unknown,
    cookie?: string,
  ) => Promise<{ status: number; body: Record<string, unknown> }>;
  cleanup: () => Promise<void>;
}

export async function createSite(label: string, unitCount = 3): Promise<TestSite> {
  const tenantId = randomUUID();
  const slug = `${label}-${Date.now()}`;
  const managerId = randomUUID();
  const tenantResidentId = randomUUID();
  const ownerIds = Array.from({ length: unitCount }, () => randomUUID());
  const unitIds: string[] = [];
  const stamp = String(Math.floor(Math.random() * 100000)).padStart(5, "0");

  await withBypassRls(`test:${label}-setup`, async (tx) => {
    await tx.insert(tenants).values({
      id: tenantId, slug, name: `Test ${label}`, type: "apartment",
      unitCount, status: "active", settings: {},
    });
    const [block] = await tx
      .insert(blocks)
      .values({ tenantId, name: "A", floorCount: unitCount, unitCount })
      .returning({ id: blocks.id });
    for (let i = 0; i < unitCount; i++) {
      const [unit] = await tx
        .insert(units)
        .values({
          tenantId, blockId: block!.id, number: String(i + 1), floor: i + 1,
          type: "flat", areaM2: "90", landShare: String(1 / unitCount),
        })
        .returning({ id: units.id });
      unitIds.push(unit!.id);
    }
    await tx.insert(users).values([
      { id: managerId, firstName: "Yönetici", lastName: label, phone: `+90555${stamp}00`.slice(0, 13), locale: "tr" },
      { id: tenantResidentId, firstName: "Kiracı", lastName: label, phone: `+90556${stamp}99`.slice(0, 13), locale: "tr" },
      ...ownerIds.map((id, i) => ({
        id, firstName: `Malik${i + 1}`, lastName: label,
        phone: `+90557${stamp}${String(i).padStart(2, "0")}`.slice(0, 13), locale: "tr",
      })),
    ]);
    await tx.insert(memberships).values([
      { tenantId, userId: managerId, role: "manager", acceptedAt: new Date() },
      { tenantId, userId: tenantResidentId, role: "tenant_resident", acceptedAt: new Date() },
      ...ownerIds.map((userId) => ({ tenantId, userId, role: "owner" as const, acceptedAt: new Date() })),
    ]);
    await tx.insert(unitOccupancies).values([
      ...ownerIds.map((userId, i) => ({
        tenantId, unitId: unitIds[i]!, userId, relation: "owner" as const,
        startDate: new Date("2024-01-01"),
      })),
      { tenantId, unitId: unitIds[0]!, userId: tenantResidentId, relation: "tenant" as const, startDate: new Date("2025-01-01") },
    ]);
  });

  const managerCookie = `${SESSION_COOKIE}=${(await createSession({ userId: managerId, tenantId })).token}`;
  const ownerCookie = `${SESSION_COOKIE}=${(await createSession({ userId: ownerIds[0]!, tenantId })).token}`;

  async function call(method: string, path: string, body?: unknown, cookie = managerCookie) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        cookie,
        origin: PANEL_ORIGIN,
        "x-tenant-slug": slug,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    };
  }

  async function cleanup() {
    const people = [managerId, tenantResidentId, ...ownerIds];
    await withBypassRls(`test:${label}-cleanup`, async (tx) => {
      // Only this disposable test tenant is removed, including its guarded audit records.
      await tx.execute(sql`SELECT set_config('app.allow_log_purge', 'on', true)`);
      await tx.delete(sessions).where(inArray(sessions.userId, people));
      await tx.delete(tenants).where(eq(tenants.id, tenantId));
      await tx.delete(users).where(inArray(users.id, people));
    });
  }

  return {
    tenantId, slug, managerId, unitIds, ownerIds, tenantResidentId,
    managerCookie, ownerCookie, call, cleanup,
  };
}
