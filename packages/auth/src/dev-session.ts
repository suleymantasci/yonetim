/**
 * Geliştirme yardımcısı: demo site için yönetici/sakin oluşturur ve oturum
 * çerezi basar. Yalnızca yerel test amaçlıdır (üretimde çalıştırılmamalı).
 *
 * Neden `packages/db` değil de burada: betik hem şemaya hem `createSession`'a
 * ihtiyaç duyuyor. `packages/db` içinde dururken `db → auth` bağımlılığı
 * doğuruyordu ve `auth → db` zaten var olduğu için bu bir döngüydü. Katman
 * sırası tek yönlü: `auth` `db`'nin üstünde durur. İkisini birden gerektiren
 * bir betik de üstteki katmana aittir.
 *
 * Kullanım:
 *   pnpm --filter @yonetim/auth dev:session manager   → yönetici oturum token'ı
 *   pnpm --filter @yonetim/auth dev:session resident  → sakin oturum token'ı
 */
import { and, eq, isNull } from "drizzle-orm";

import {
  closeDb,
  memberships,
  tenants,
  unitOccupancies,
  units,
  users,
  withBypassRls,
} from "@yonetim/db";

import { createSession } from "./session";
import { loadRootEnv } from "../../../env-loader.mjs";

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

  // H-9: Token'ı stdout'a yazmak log aggregator'lar tarafından kalıcı
  // indeksleniyor. Bearer nitelikteki bir credential stdout'a yazılmamalı.
  // Bunun yerine yalnızca kullanıcı/tenant bilgisi yazılır; token operatörün
  // ihtiyacı varsa ortam değişkenine koyup kendi script'iyle kullanabilir.
  // --print-token flag'i bilinçli geçici çözümdür (release'lerde kaldırılabilir).
  const printToken = process.argv.includes("--print-token");
  if (printToken) {
    console.log(JSON.stringify({ token, ...result }));
  } else {
    console.log(
      JSON.stringify({
        ...result,
        _hint: "Token'ı görmek için --print-token flag'i kullanın (log kirliliği).",
      }),
    );
  }
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
