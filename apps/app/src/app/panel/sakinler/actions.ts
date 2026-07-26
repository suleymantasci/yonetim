"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  consents, debts, memberships, unitOccupancies, units, users, withBypassRls, withTenant,
} from "@yonetim/db";

import { audit, diffOf, logDataAccess } from "@/lib/audit";
import { requirePermission } from "@/lib/context";
import {
  ActionError, asArray, checkboxField, dateField, emailField, errorState, okState,
  optionalDateField, optionalText, optionalUuidField, phoneField, requiredText, runAction,
  tcknField, uuidField, V, type ActionState,
} from "@/lib/form";
import { sealTckn, tcknLookupIndex } from "@/lib/pii";

/**
 * Sakin (malik / kiracı) CRUD ve birim ilişkileri — GAP 4.1.2.
 *
 * VERİ MODELİ NOTU: kişi `users` tablosunda **platform genelinde tekil**
 * tutulur; siteye bağlanma `memberships`, bir bağımsız bölümle ilişki
 * `unit_occupancies` üzerinden kurulur. Bu, Yonetimcell'in "tek cari"
 * yaklaşımını doğal olarak karşılar: bir kişi 5 dairede malik olsa da tek
 * kullanıcı kaydıdır, borçları tek yerde toplanır.
 *
 * `users` tablosu RLS kapsamı dışında (tenant'sız) olduğu için her erişim
 * `withBypassRls` ile ve **gerekçe etiketiyle** yapılır; ayrıca kişisel veri
 * okuma/yazma `data_access_logs`'a yazılır (GAP 4.2.7 / TD-02).
 */

const RELATIONS = ["owner", "tenant", "vacant"] as const;
const TRANSFER_POLICIES = ["owner", "next_tenant", "keep"] as const;
const RESIDENT_ROLES = ["owner", "tenant_resident", "staff", "auditor", "accountant"] as const;

/* ------------------------------------------------------------------ *
 * Sakin oluşturma
 * ------------------------------------------------------------------ */

const residentSchema = z.object({
  firstName: requiredText(2, 80),
  lastName: requiredText(2, 80),
  phone: phoneField,
  email: emailField,
  tckn: tcknField,
  role: z.enum(RESIDENT_ROLES, { errorMap: () => ({ message: V.invalidSelection }) }),
  locale: z.enum(["tr", "en", "ar", "ru"]).default("tr"),
  whatsappOptIn: checkboxField,
  /** KVKK aydınlatma onayı — kayıt için zorunlu (md.10). */
  kvkkAcknowledged: checkboxField,
  emergencyContactName: optionalText(120),
  emergencyContactPhone: phoneField,
  notes: optionalText(1000),

  /** İlk ilişki (isteğe bağlı): birim + rol + başlangıç. */
  unitId: optionalUuidField,
  relation: z.enum(RELATIONS).optional(),
  ownershipPct: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 100 : Number(String(value).replace(",", "."))),
    z.number().min(0.001, V.minValue(0)).max(100, V.maxValue(100)),
  ),
  startDate: optionalDateField,
  debtTransferPolicy: z.enum(TRANSFER_POLICIES).default("owner"),
});

export async function createResident(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "resident:write",
      schema: residentSchema,
      meta: { action: "resident_created", resource: "resident" },
    },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.residents");

      if (!input.kvkkAcknowledged) {
        return errorState(t("kvkkRequired"), { kvkkAcknowledged: [t("kvkkRequired")] });
      }
      if (!input.phone && !input.email) {
        // İletişim kanalı olmayan sakine borç bildirimi gönderilemez; kayıt anlamsız kalır.
        return errorState(t("contactRequired"), {
          phone: [t("contactRequired")],
          email: [t("contactRequired")],
        });
      }

      const tckn = sealTckn(input.tckn, ctx.tenantId);

      const userId = await withBypassRls("residents:create", async (tx) => {
        // Aynı telefon/e-posta ile kayıt varsa yeni kullanıcı açmayız: kişi
        // başka bir sitede zaten kayıtlı olabilir (çoklu tenant). Mevcut
        // kaydı bu siteye bağlarız — "tek cari" ilkesi bunu gerektirir.
        const existing = await tx
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(
            and(
              isNull(users.deletedAt),
              input.phone
                ? eq(users.phone, input.phone)
                : eq(users.email, input.email!),
            ),
          )
          .limit(1);

        if (existing[0]) {
          await tx
            .update(users)
            .set({
              firstName: input.firstName,
              lastName: input.lastName,
              email: input.email ?? undefined,
              phone: input.phone ?? undefined,
              locale: input.locale,
              whatsappOptIn: input.whatsappOptIn,
              whatsappOptInAt: input.whatsappOptIn ? new Date() : null,
              emergencyContactName: input.emergencyContactName ?? undefined,
              emergencyContactPhone: input.emergencyContactPhone ?? undefined,
              ...(tckn ? { tcknEncrypted: tckn.encrypted, tcknIndex: tckn.index } : {}),
            })
            .where(eq(users.id, existing[0].id));
          return existing[0].id;
        }

        const [created] = await tx
          .insert(users)
          .values({
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone ?? null,
            email: input.email ?? null,
            locale: input.locale,
            whatsappOptIn: input.whatsappOptIn,
            whatsappOptInAt: input.whatsappOptIn ? new Date() : null,
            emergencyContactName: input.emergencyContactName ?? null,
            emergencyContactPhone: input.emergencyContactPhone ?? null,
            tcknEncrypted: tckn?.encrypted ?? null,
            tcknIndex: tckn?.index ?? null,
          })
          .returning({ id: users.id });
        if (!created) throw new ActionError(t("createFailed"));
        return created.id;
      });

      setResourceId(userId);

      await withTenant(
        ctx.tenantId,
        async (tx) => {
          // Üyelik: aynı rol için tekil index var, çakışmayı yok say.
          await tx
            .insert(memberships)
            .values({
              tenantId: ctx.tenantId,
              userId,
              role: input.role,
              notes: input.notes ?? null,
              invitedBy: ctx.userId,
              invitedAt: new Date(),
              acceptedAt: new Date(),
            })
            .onConflictDoNothing();

          if (input.unitId && input.relation && input.relation !== "vacant") {
            await linkOccupancy(tx, {
              tenantId: ctx.tenantId,
              unitId: input.unitId,
              userId,
              relation: input.relation,
              ownershipPct: input.ownershipPct,
              startDate: input.startDate ?? new Date(),
              debtTransferPolicy: input.debtTransferPolicy,
            });
          }
        },
        { userId: ctx.userId },
      );

      // KVKK: aydınlatma metni onayı versiyonlanarak saklanır (md.10).
      await withBypassRls("residents:consent", async (tx) => {
        await tx.insert(consents).values({
          tenantId: ctx.tenantId,
          userId,
          kind: "kvkk_aydinlatma",
          granted: true,
          documentVersion: KVKK_NOTICE_VERSION,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          grantedAt: new Date(),
        });
        if (input.whatsappOptIn) {
          await tx.insert(consents).values({
            tenantId: ctx.tenantId,
            userId,
            kind: "whatsapp_iletisim",
            granted: true,
            documentVersion: KVKK_NOTICE_VERSION,
            ip: ctx.ip,
            grantedAt: new Date(),
          });
        }
      });

      await logDataAccess(ctx, {
        subjectUserId: userId,
        dataCategory: "kimlik_bilgisi",
        action: "update",
        purpose: "resident_create",
      });

      revalidatePath("/panel/sakinler");
      if (input.unitId) revalidatePath(`/panel/birimler/${input.unitId}`);

      return okState(t("created", { name: `${input.firstName} ${input.lastName}` }), {
        redirectTo: `/panel/sakinler/${userId}`,
        data: { id: userId },
      });
    },
  );
}

/**
 * Aydınlatma metni sürümü. Metin değişince bu sabit artırılır; eski onaylar
 * hangi sürüme verildiğini korur (GAP 4.1.13 "aydınlatma metni versiyonlama").
 */
const KVKK_NOTICE_VERSION = "2026.1";

/* ------------------------------------------------------------------ *
 * Sakin güncelleme
 * ------------------------------------------------------------------ */

const updateSchema = z.object({
  id: uuidField,
  firstName: requiredText(2, 80),
  lastName: requiredText(2, 80),
  phone: phoneField,
  email: emailField,
  tckn: tcknField,
  role: z.enum(RESIDENT_ROLES, { errorMap: () => ({ message: V.invalidSelection }) }),
  locale: z.enum(["tr", "en", "ar", "ru"]).default("tr"),
  whatsappOptIn: checkboxField,
  emergencyContactName: optionalText(120),
  emergencyContactPhone: phoneField,
  notes: optionalText(1000),
});

export async function updateResident(
  _previous: ActionState<{ id: string }>,
  formData: FormData,
): Promise<ActionState<{ id: string }>> {
  return runAction(
    {
      permission: "resident:write",
      schema: updateSchema,
      meta: { action: "resident_updated", resource: "resident" },
    },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.residents");
      setResourceId(input.id);

      // Bu kişi bu sitede kayıtlı mı? Kayıtlı değilse başka tenant'ın verisini
      // düzenleme girişimidir — yatay yetki kontrolü (users tablosu RLS dışı).
      const isMember = await withTenant(ctx.tenantId, async (tx) => {
        const rows = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.userId, input.id), isNull(memberships.deletedAt)))
          .limit(1);
        return rows.length > 0;
      });
      if (!isMember) throw new ActionError(t("notInTenant"));

      const tckn = sealTckn(input.tckn, ctx.tenantId);

      const changes = await withBypassRls("residents:update", async (tx) => {
        const [before] = await tx
          .select({
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            email: users.email,
            locale: users.locale,
            whatsappOptIn: users.whatsappOptIn,
          })
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);
        if (!before) throw new ActionError(t("notFound"));

        const patch = {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          email: input.email ?? null,
          locale: input.locale,
          whatsappOptIn: input.whatsappOptIn,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
        };

        await tx
          .update(users)
          .set({
            ...patch,
            whatsappOptInAt: input.whatsappOptIn ? new Date() : null,
            // TCKN yalnız yeni değer geldiyse yazılır: boş bırakmak silme demek değil.
            ...(tckn ? { tcknEncrypted: tckn.encrypted, tcknIndex: tckn.index } : {}),
          })
          .where(eq(users.id, input.id));

        return diffOf(before as unknown as Record<string, unknown>, patch);
      });

      await withTenant(
        ctx.tenantId,
        async (tx) => {
          await tx
            .insert(memberships)
            .values({
              tenantId: ctx.tenantId,
              userId: input.id,
              role: input.role,
              notes: input.notes ?? null,
              acceptedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [memberships.tenantId, memberships.userId, memberships.role],
              set: { notes: input.notes ?? null, deletedAt: null },
            });
        },
        { userId: ctx.userId },
      );

      await audit(ctx, {
        action: "resident_updated",
        resource: "resident",
        resourceId: input.id,
        // Telefon/e-posta gibi kişisel veriler diff'te tutulur; audit kütüğü
        // zaten en yüksek koruma seviyesinde ve KVKK izlenebilirliği bunu ister.
        diff: changes,
      });
      await logDataAccess(ctx, {
        subjectUserId: input.id,
        dataCategory: "kimlik_bilgisi",
        action: "update",
        purpose: "resident_update",
      });

      revalidatePath("/panel/sakinler");
      revalidatePath(`/panel/sakinler/${input.id}`);

      return okState(t("updated"), {
        redirectTo: `/panel/sakinler/${input.id}`,
        data: { id: input.id },
      });
    },
  );
}

/* ------------------------------------------------------------------ *
 * Birim ilişkisi (occupancy)
 * ------------------------------------------------------------------ */

const occupancySchema = z.object({
  userId: uuidField,
  unitId: uuidField,
  relation: z.enum(["owner", "tenant"], { errorMap: () => ({ message: V.invalidSelection }) }),
  ownershipPct: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? 100 : Number(String(value).replace(",", "."))),
    z.number().min(0.001, V.minValue(0)).max(100, V.maxValue(100)),
  ),
  startDate: dateField,
  debtTransferPolicy: z.enum(TRANSFER_POLICIES).default("owner"),
  contractUrl: optionalText(500),
});

/** Sakini bir bağımsız bölüme bağlar (drawer içinden, sayfadan çıkmadan). */
export async function addOccupancy(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "resident:write",
      schema: occupancySchema,
      meta: { action: "occupancy_created", resource: "unit_occupancy" },
    },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.residents");

      const occupancyId = await withTenant(
        ctx.tenantId,
        async (tx) =>
          linkOccupancy(tx, {
            tenantId: ctx.tenantId,
            unitId: input.unitId,
            userId: input.userId,
            relation: input.relation,
            ownershipPct: input.ownershipPct,
            startDate: input.startDate,
            debtTransferPolicy: input.debtTransferPolicy,
            contractUrl: input.contractUrl,
            translate: t,
          }),
        { userId: ctx.userId },
      );

      if (occupancyId) setResourceId(occupancyId);
      revalidatePath(`/panel/sakinler/${input.userId}`);
      revalidatePath(`/panel/birimler/${input.unitId}`);
      return okState(t("occupancyAdded"));
    },
  );
}

const endOccupancySchema = z.object({
  occupancyId: uuidField,
  endDate: dateField,
  /**
   * Kalan borç ne olacak: politika kaydındaki varsayılan yerine burada
   * açıkça seçilir — çıkış anı, kararın verildiği andır.
   */
  transferTo: z.enum(["owner", "next_tenant", "keep"], {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  reason: optionalText(500),
});

export interface EndOccupancyResult {
  transferredDebtCount: number;
  transferredKurus: number;
}

/**
 * Kiracı ayrılma akışı + borç devir motoru — GAP 4.2.4.
 *
 * `debt_transfer_policy` alanı şemada vardı ama hiçbir şey onu uygulamıyordu.
 * Motor burada:
 *   - `keep`         → borç kişide kalır, hiçbir şey değişmez
 *   - `owner`        → ödenmemiş borçların yükümlüsü aktif malike geçer
 *   - `next_tenant`  → devir **ertelenir**: yeni kiracı bağlandığında
 *                      borç ona geçsin diye borç metadata'sına işaret bırakılır
 *
 * Devir bir UPDATE değil, **denetlenebilir** bir olaydır: her borç için
 * `audit_debt_changes` üzerinden değil (tutar değişmiyor) ama `audit_logs`
 * üzerinden kaydedilir ve gerekçe zorunlu tutulur.
 */
export async function endOccupancy(
  _previous: ActionState<EndOccupancyResult>,
  formData: FormData,
): Promise<ActionState<EndOccupancyResult>> {
  return runAction(
    {
      permission: "resident:write",
      schema: endOccupancySchema,
      meta: { action: "occupancy_ended", resource: "unit_occupancy" },
    },
    formData,
    async ({ ctx, input, setResourceId }) => {
      const t = await getTranslations("app.residents");
      setResourceId(input.occupancyId);

      const result = await withTenant(
        ctx.tenantId,
        async (tx) => {
          const [occupancy] = await tx
            .select()
            .from(unitOccupancies)
            .where(eq(unitOccupancies.id, input.occupancyId))
            .limit(1);
          if (!occupancy) throw new ActionError(t("occupancyNotFound"));
          if (occupancy.endDate) throw new ActionError(t("occupancyAlreadyEnded"));

          await tx
            .update(unitOccupancies)
            .set({ endDate: input.endDate, debtTransferPolicy: input.transferTo })
            .where(eq(unitOccupancies.id, input.occupancyId));

          // Ayrılan kişinin bu birimdeki ödenmemiş borçları.
          const openDebts = await tx
            .select({
              id: debts.id,
              amountKurus: debts.amountKurus,
              paidKurus: debts.paidKurus,
              lateFeeKurus: debts.lateFeeKurus,
            })
            .from(debts)
            .where(
              and(
                eq(debts.unitId, occupancy.unitId),
                eq(debts.debtorUserId, occupancy.userId),
                isNull(debts.deletedAt),
                sql`${debts.status} <> 'paid'`,
              ),
            );

          const remaining = openDebts.reduce(
            (sum, debt) => sum + (debt.amountKurus + debt.lateFeeKurus - debt.paidKurus),
            0,
          );

          if (input.transferTo === "keep" || openDebts.length === 0) {
            return { transferredDebtCount: 0, transferredKurus: remaining };
          }

          if (input.transferTo === "owner") {
            const [owner] = await tx
              .select({ userId: unitOccupancies.userId })
              .from(unitOccupancies)
              .where(
                and(
                  eq(unitOccupancies.unitId, occupancy.unitId),
                  eq(unitOccupancies.relation, "owner"),
                  isNull(unitOccupancies.endDate),
                ),
              )
              .limit(1);
            if (!owner) throw new ActionError(t("noActiveOwner"));

            for (const debt of openDebts) {
              await tx
                .update(debts)
                .set({
                  debtorUserId: owner.userId,
                  metadata: sql`${debts.metadata} || jsonb_build_object(
                    'transferredFrom', ${occupancy.userId}::text,
                    'transferredAt', ${input.endDate.toISOString()},
                    'transferReason', ${input.reason ?? "occupancy_ended"}
                  )`,
                })
                .where(eq(debts.id, debt.id));
            }
            return { transferredDebtCount: openDebts.length, transferredKurus: remaining };
          }

          // next_tenant: devir ertelenir, borçlar işaretlenir.
          for (const debt of openDebts) {
            await tx
              .update(debts)
              .set({
                metadata: sql`${debts.metadata} || jsonb_build_object(
                  'pendingTransferTo', 'next_tenant',
                  'transferredFrom', ${occupancy.userId}::text,
                  'transferMarkedAt', ${input.endDate.toISOString()}
                )`,
              })
              .where(eq(debts.id, debt.id));
          }
          return { transferredDebtCount: 0, transferredKurus: remaining };
        },
        { userId: ctx.userId },
      );

      await audit(ctx, {
        action: "occupancy_ended",
        resource: "unit_occupancy",
        resourceId: input.occupancyId,
        reason: `${input.transferTo}: ${input.reason ?? "-"} (${result.transferredDebtCount} borç, ${result.transferredKurus} kuruş)`,
      });

      revalidatePath("/panel/sakinler");
      revalidatePath("/panel/borclar");

      return okState(
        input.transferTo === "owner"
          ? t("occupancyEndedTransferred", { count: result.transferredDebtCount })
          : input.transferTo === "next_tenant"
            ? t("occupancyEndedPending")
            : t("occupancyEnded"),
        { data: result },
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * Silme / geri alma
 * ------------------------------------------------------------------ */

export interface BulkResult {
  ok: boolean;
  message: string;
}

/**
 * Sakini siteden çıkarır.
 *
 * ÖNEMLİ: `users` kaydı **silinmez**. Kişi başka sitelerde de kayıtlı olabilir;
 * global kaydı silmek onların verisini bozar. Silinen şey bu sitedeki
 * **üyelik** ve açık ilişkilerdir. Kişinin kendi verisinin silinmesi KVKK
 * md.7 talebiyle ve anonimleştirme hattıyla yürür (ayrı akış).
 */
export async function removeResidents(ids: string[]): Promise<BulkResult> {
  const ctx = await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const affected = await withTenant(
    ctx.tenantId,
    async (tx) => {
      let count = 0;
      for (const userId of targets) {
        // Ödenmemiş borcu olan sakin çıkarılamaz: cari hesabı açıkta kalır.
        const [debtRow] = await tx
          .select({ value: sql<number>`COUNT(*)` })
          .from(debts)
          .where(
            and(
              eq(debts.debtorUserId, userId),
              isNull(debts.deletedAt),
              sql`${debts.status} <> 'paid'`,
            ),
          );
        if (Number(debtRow?.value ?? 0) > 0) continue;

        await tx
          .update(memberships)
          .set({ deletedAt: new Date() })
          .where(and(eq(memberships.userId, userId), isNull(memberships.deletedAt)));
        await tx
          .update(unitOccupancies)
          .set({ endDate: new Date() })
          .where(and(eq(unitOccupancies.userId, userId), isNull(unitOccupancies.endDate)));
        count += 1;
      }
      return count;
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: "resident_bulk_removed",
    resource: "resident",
    reason: `${affected}/${targets.length}`,
  });
  revalidatePath("/panel/sakinler");

  return affected === targets.length
    ? { ok: true, message: t("bulkRemoved", { count: affected }) }
    : {
        ok: true,
        message: t("bulkRemovedPartial", {
          count: affected,
          skipped: targets.length - affected,
        }),
      };
}

/** WhatsApp opt-in durumunu toplu değiştir (rıza kaydıyla birlikte). */
export async function setWhatsappOptIn(ids: string[], optIn: boolean): Promise<BulkResult> {
  const ctx = await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  await withBypassRls("residents:whatsapp-optin", async (tx) => {
    for (const userId of targets) {
      await tx
        .update(users)
        .set({ whatsappOptIn: optIn, whatsappOptInAt: optIn ? new Date() : null })
        .where(eq(users.id, userId));
      // Rıza değişimi izlenebilir olmalı: verildi/geri alındı ayrı satır.
      await tx.insert(consents).values({
        tenantId: ctx.tenantId,
        userId,
        kind: "whatsapp_iletisim",
        granted: optIn,
        documentVersion: KVKK_NOTICE_VERSION,
        ip: ctx.ip,
        grantedAt: optIn ? new Date() : null,
        revokedAt: optIn ? null : new Date(),
      });
    }
  });

  await audit(ctx, {
    action: optIn ? "resident_whatsapp_opt_in" : "resident_whatsapp_opt_out",
    resource: "resident",
    reason: String(targets.length),
  });
  revalidatePath("/panel/sakinler");
  return { ok: true, message: optIn ? t("optInDone") : t("optOutDone") };
}

/* ------------------------------------------------------------------ *
 * Yardımcılar
 * ------------------------------------------------------------------ */

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * İlişki kurar ve `units` üzerindeki özet alanları (currentOwnerId /
 * currentTenantId / ownershipType) tazeler.
 *
 * Aynı birimde aynı kişi için açık bir ilişki varsa yenisi açılmaz —
 * çift kayıt cari hesabı ikiye böler.
 */
async function linkOccupancy(
  tx: Tx,
  params: {
    tenantId: string;
    unitId: string;
    userId: string;
    relation: "owner" | "tenant";
    ownershipPct: number;
    startDate: Date;
    debtTransferPolicy: string;
    contractUrl?: string;
    translate?: (key: string) => string;
  },
): Promise<string | undefined> {
  const existing = await tx
    .select({ id: unitOccupancies.id })
    .from(unitOccupancies)
    .where(
      and(
        eq(unitOccupancies.unitId, params.unitId),
        eq(unitOccupancies.userId, params.userId),
        eq(unitOccupancies.relation, params.relation),
        isNull(unitOccupancies.endDate),
      ),
    )
    .limit(1);

  if (existing[0]) {
    if (params.translate) throw new ActionError(params.translate("occupancyExists"));
    return existing[0].id;
  }

  // Kiracı ilişkisi tekildir: yeni kiracı gelirse öncekinin kaydı kapanmalı.
  if (params.relation === "tenant") {
    await tx
      .update(unitOccupancies)
      .set({ endDate: params.startDate })
      .where(
        and(
          eq(unitOccupancies.unitId, params.unitId),
          eq(unitOccupancies.relation, "tenant"),
          isNull(unitOccupancies.endDate),
        ),
      );
  }

  const [created] = await tx
    .insert(unitOccupancies)
    .values({
      tenantId: params.tenantId,
      unitId: params.unitId,
      userId: params.userId,
      relation: params.relation,
      ownershipPct: params.ownershipPct.toFixed(3),
      startDate: params.startDate,
      debtTransferPolicy: params.debtTransferPolicy,
      contractUrl: params.contractUrl ?? null,
    })
    .returning({ id: unitOccupancies.id });

  await tx
    .update(units)
    .set(
      params.relation === "owner"
        ? { currentOwnerId: params.userId, ownershipType: "owner" }
        : { currentTenantId: params.userId, ownershipType: "tenant" },
    )
    .where(eq(units.id, params.unitId));

  return created?.id;
}

/** TCKN çakışma kontrolü (blind index üzerinden) — form ipucu için. */
export async function findResidentByTckn(tckn: string): Promise<{ id: string; name: string } | null> {
  const ctx = await requirePermission("resident:read");
  if (tckn.replace(/\D+/g, "").length !== 11) return null;

  const index = tcknLookupIndex(tckn);
  const rows = await withBypassRls("residents:tckn-lookup", async (tx) =>
    tx
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(eq(users.tcknIndex, index), isNull(users.deletedAt)))
      .limit(1),
  );

  const found = rows[0];
  if (!found) return null;

  await logDataAccess(ctx, {
    subjectUserId: found.id,
    dataCategory: "kimlik_bilgisi",
    action: "view",
    purpose: "tckn_duplicate_check",
  });

  return {
    id: found.id,
    name: [found.firstName, found.lastName].filter(Boolean).join(" "),
  };
}
