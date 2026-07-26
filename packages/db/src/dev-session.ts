/**
 * Geliştirme yardımcısı: demo site için yönetici/sakin oluşturur ve oturum
 * çerezi basar. Yalnızca yerel test amaçlıdır (üretimde çalıştırılmamalı).
 *
 * Kullanım:
 *   tsx src/dev-session.ts manager   → yönetici oturum token'ı
 *   tsx src/dev-session.ts resident  → sakin oturum token'ı
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { createSession } from "@yonetim/auth";
import { currentPeriod, periodKey, tlToKurus } from "@yonetim/core";

import { closeDb, withBypassRls } from "./client";
import { loadRootEnv } from "../../../env-loader.mjs";
import {
  debts, duesPlans, expenses, expenseCategories, maintenanceRecords, maintenanceTemplates,
  memberships, announcements, requests, tenants, unitOccupancies, units, users,
} from "./schema/index";

loadRootEnv();

if (process.env.NODE_ENV === "production") {
  throw new Error("dev-session yalnızca geliştirme ortamında çalıştırılabilir.");
}

const role = (process.argv[2] ?? "manager") as "manager" | "resident";

async function main() {
  if (process.env.DATABASE_OWNER_URL) {
    process.env.DATABASE_ADMIN_URL = process.env.DATABASE_OWNER_URL;
  }

  const result = await withBypassRls("dev:session", async (tx) => {
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.slug, "ornek-apartmani"))
      .limit(1);
    if (!tenant) throw new Error("Demo site bulunamadı, önce `pnpm db:seed` çalıştırın.");

    const email = role === "manager" ? "yonetici@ornek.test" : "sakin@ornek.test";
    const phone = role === "manager" ? "+905550000001" : "+905550000002";

    let [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({
          email,
          phone,
          firstName: role === "manager" ? "Ali" : "Ayşe",
          lastName: role === "manager" ? "Yönetici" : "Sakin",
          whatsappOptIn: role === "resident",
          emailVerifiedAt: new Date(),
        })
        .returning();
    }

    const existingMembership = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.tenantId, tenant.id), eq(memberships.userId, user!.id)))
      .limit(1);

    if (existingMembership.length === 0) {
      await tx.insert(memberships).values({
        tenantId: tenant.id,
        userId: user!.id,
        role: role === "manager" ? "manager" : "owner",
        isPrimary: role === "manager",
        acceptedAt: new Date(),
      });
    }

    // Sakini bir bağımsız bölüme bağla ve örnek borç üret.
    const [unit] = await tx
      .select()
      .from(units)
      .where(and(eq(units.tenantId, tenant.id), isNull(units.deletedAt)))
      .limit(1);

    if (unit) {
      const occ = await tx
        .select()
        .from(unitOccupancies)
        .where(and(eq(unitOccupancies.unitId, unit.id), eq(unitOccupancies.userId, user!.id)))
        .limit(1);
      if (occ.length === 0) {
        await tx.insert(unitOccupancies).values({
          tenantId: tenant.id,
          unitId: unit.id,
          userId: user!.id,
          relation: role === "manager" ? "owner" : "owner",
          startDate: new Date(),
        });
      }
      await tx
        .update(units)
        .set({ currentOwnerId: user!.id, residentCount: 3 })
        .where(eq(units.id, unit.id));
    }

    return { tenantId: tenant.id, userId: user!.id, unitId: unit?.id };
  });

  // Oturum, kullanıcı kaydı COMMIT edildikten sonra ayrı bir transaction'da
  // oluşturulur; aksi halde sessions→users yabancı anahtarı görünmez.
  const { token } = await createSession({
    userId: result.userId,
    tenantId: result.tenantId,
    rememberMe: true,
  });

  console.log(JSON.stringify({ token, ...result }));
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});

export { randomUUID, debts, duesPlans, expenses, expenseCategories, maintenanceRecords, maintenanceTemplates, announcements, requests, currentPeriod, periodKey, tlToKurus };
