import { randomBytes, randomUUID, scryptSync } from "node:crypto";

import { tlToKurus } from "@yonetim/core";
import { planForUnitCount } from "@yonetim/pricing";

import { closeDb, getDb, withBypassRls } from "./client";
import { loadRootEnv } from "../../../env-loader.mjs";
import {
  blocks, campaigns, expenseCategories, maintenanceTemplates, memberships, plans, tenants, units,
  users, duesPlans, resources,
} from "./schema/index";
import { CAMPAIGN_TEMPLATE_SEED } from "./seed-data/campaigns";
import { EXPENSE_CATEGORY_SEED } from "./seed-data/expense-categories";
import { MAINTENANCE_TEMPLATE_SEED } from "./seed-data/maintenance";
import { PLAN_SEED } from "./seed-data/plans";

loadRootEnv();

/**
 * Seed: platform verisi (planlar, bakım kütüphanesi, kampanyalar) +
 * geliştirme için örnek bir site (Faz 0 demo).
 */
async function main() {
  // Seed, RLS öncesi platform verisini yazar; sahibi bağlantısı gerekir.
  if (process.env.DATABASE_OWNER_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_OWNER_URL;
    process.env.DATABASE_ADMIN_URL = process.env.DATABASE_OWNER_URL;
  }

  const db = getDb();

  console.log("→ Planlar yükleniyor...");
  for (const p of PLAN_SEED) {
    await db
      .insert(plans)
      .values({
        code: p.code,
        name: p.name,
        tier: p.tier,
        minUnits: p.minUnits,
        maxUnits: p.maxUnits,
        yearlyPriceKurus: tlToKurus(p.yearlyPriceTl),
        smsQuotaYearly: p.smsQuotaYearly,
        competitorYearlyPriceKurus: p.competitorYearlyTl ? tlToKurus(p.competitorYearlyTl) : null,
        isCustom: p.isCustom,
        sortOrder: p.tier,
      })
      .onConflictDoNothing();
  }

  console.log("→ Bakım şablonları yükleniyor (50+)...");
  for (const t of MAINTENANCE_TEMPLATE_SEED) {
    await db
      .insert(maintenanceTemplates)
      .values({
        code: t.code,
        equipmentType: t.equipmentType,
        name: t.name,
        intervalDays: t.intervalDays,
        regulatoryRef: t.regulatoryRef,
        isMandatory: t.isMandatory,
        checklist: t.checklist,
      })
      .onConflictDoNothing();
  }

  console.log("→ Kampanya şablonları yükleniyor...");
  for (const c of CAMPAIGN_TEMPLATE_SEED) {
    await db
      .insert(campaigns)
      .values({
        code: c.code,
        slug: c.slug,
        name: c.name,
        description: c.description,
        type: c.type,
        status: c.status,
        audience: c.audience,
        conditions: c.conditions,
        reward: c.reward,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        perTenantLimit: c.perTenantLimit ?? 1,
        showOnPricingPage: c.showOnPricingPage,
        badge: c.badge,
        stackable: c.stackable,
        metadata: c.metadata,
      })
      .onConflictDoNothing();
  }

  if (process.env.SEED_DEMO !== "false") {
    await seedDemoTenant();
  }

  console.log("✓ Seed tamamlandı.");
  await closeDb();
}

/**
 * Demo yöneticisinin giriş parolası.
 *
 * PAROLA NEDEN GEREKLİ: giriş artık parola soruyor (`POST
 * /v1/auth/web/password`). Parolasız açılan bir demo hesabı, seed'i çalıştıran
 * geliştiricinin ancak SMS/e-posta yapılandırıp kurtarma akışından girebildiği
 * bir hesap olurdu — yapılandırılmamış kurulumda kodu yalnız sunucu logunda
 * görebilirdi.
 */
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "OrnekSite2026";

/**
 * `packages/auth`'daki `hashPassword` ile **aynı** biçim (`scrypt$salt$hash`).
 *
 * Kopya, seçilmiş bir bağımlılık kısıtı: `@yonetim/auth` zaten `@yonetim/db`'ye
 * bağlı, ters yönde bir bağımlılık eklemek iki paketi birbirine kilitlerdi.
 * Biçim değişirse burası da değişmeli — bu yüzden format tek satırda ve
 * göz önünde.
 */
function hashPasswordSync(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${scryptSync(password, salt, 64).toString("base64")}`;
}

async function seedDemoTenant() {
  console.log("→ Demo site oluşturuluyor...");
  const tenantId = randomUUID();
  const managerId = randomUUID();
  const unitCount = 24;
  const plan = planForUnitCount(unitCount);

  await withBypassRls("seed:demo-tenant", async (tx) => {
    await tx.insert(users).values({
      id: managerId,
      email: "yonetici@ornek.test",
      phone: "+905550000001",
      firstName: "Ali",
      lastName: "Yönetici",
      locale: "tr",
      passwordHash: hashPasswordSync(DEMO_PASSWORD),
      // Parola çakışmada da yazılıyor (diğer alanlar değil): demo hesabı zaten
      // duran bir veritabanında `onConflictDoNothing` parolayı hiç eklemezdi
      // ve seed'i yeniden çalıştıran geliştirici, "parolayı seed veriyor" yazan
      // bir kurulumda giriş yapamazdı.
    }).onConflictDoUpdate({
      target: users.email,
      set: { passwordHash: hashPasswordSync(DEMO_PASSWORD) },
    });

    const [planRow] = await tx.select().from(plans).limit(50);
    const planId = planRow?.id;

    await tx.insert(tenants).values({
      id: tenantId,
      slug: "ornek-apartmani",
      name: "Örnek Apartmanı",
      type: "apartment",
      unitCount,
      managerId,
      city: "İstanbul",
      district: "Kadıköy",
      neighborhood: "Caferağa",
      addressLine: "Örnek Sokak No:1",
      status: "trial",
      planId: planId ?? null,
      trialStartedAt: new Date(),
      trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
      landingPublished: true,
      settings: { duesDueDayOfMonth: 10, lateFeeEnabled: true, lateFeeMonthlyPct: 5 },
    }).onConflictDoNothing();

    await tx.insert(memberships).values({
      tenantId,
      userId: managerId,
      role: "manager",
      isPrimary: true,
      acceptedAt: new Date(),
    }).onConflictDoNothing();

    const blockId = randomUUID();
    await tx.insert(blocks).values({
      id: blockId,
      tenantId,
      name: "A Blok",
      floorCount: 6,
      unitCount,
      hasElevator: true,
    }).onConflictDoNothing();

    for (let i = 1; i <= unitCount; i++) {
      await tx.insert(units).values({
        tenantId,
        blockId,
        number: String(i),
        floor: Math.ceil(i / 4),
        type: "flat",
        areaM2: String(95 + (i % 4) * 15),
        landShare: String((1 / unitCount).toFixed(6)),
        residentCount: 2 + (i % 3),
      }).onConflictDoNothing();
    }

    for (const cat of EXPENSE_CATEGORY_SEED) {
      await tx.insert(expenseCategories).values({
        tenantId,
        name: cat.name,
        distribution: cat.distribution,
        isShared: cat.isShared,
        color: cat.color,
      }).onConflictDoNothing();
    }

    await tx.insert(duesPlans).values({
      tenantId,
      name: "Aylık Aidat",
      period: "monthly",
      formula: "equal",
      baseAmountKurus: tlToKurus(1_250),
      dueDayOfMonth: 10,
      startPeriod: new Date().toISOString().slice(0, 7),
      isActive: true,
      createdBy: managerId,
    }).onConflictDoNothing();

    await tx.insert(resources).values([
      { tenantId, name: "Toplantı Salonu", kind: "salon", capacity: 40, feeKurus: tlToKurus(500), feeUnit: "hour" },
      { tenantId, name: "Misafir Odası", kind: "misafir_odasi", capacity: 2, feeKurus: tlToKurus(750), feeUnit: "day" },
      { tenantId, name: "Spor Salonu", kind: "spor", capacity: 12, feeKurus: 0, feeUnit: "hour" },
    ]).onConflictDoNothing();
  });

  console.log(`  Demo site: ornek-apartmani (${unitCount} daire, plan: ${plan.name})`);
  console.log(`  Demo giriş: yonetici@ornek.test / ${DEMO_PASSWORD}`);
}

main().catch(async (error) => {
  console.error("✗ Seed hatası:", error);
  await closeDb();
  process.exit(1);
});
