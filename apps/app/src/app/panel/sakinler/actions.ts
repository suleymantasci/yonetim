"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import {
  BLOOD_TYPES,
  occupancyEndResult,
  residentRemoveResult,
  residentSaveResult,
  tcknLookupResult,
} from "@yonetim/contracts";

import { apiGet, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  asArray,
  checkboxField,
  dateField,
  emailField,
  errorState,
  okState,
  optionalDateField,
  optionalText,
  optionalUuidField,
  phoneField,
  requiredText,
  runAction,
  tcknField,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * Sakin (malik / kiracı) CRUD ve birim ilişkileri — GAP 4.1.2.
 *
 * MIMARI-PLAN §8.5 sonrası bu dosya **sunum tarafı**: form doğrulaması
 * (kullanıcıya alan bazlı hata gösterebilmek için) ve HTTP çağrısı.
 *
 * Buraya ait OLMAYAN, artık `apps/api`'de olan işler:
 *
 *  - TCKN şifreleme/çözme — anahtar bu konteynerde yok (§9.1)
 *  - `users` tablosuna dar kapsamlı RLS baypası (GAP 4.2.7)
 *  - "tek cari" birleştirme: aynı telefonla kayıtlı kişiyi yeniden açmak yerine
 *    siteye bağlama
 *  - borç devir motoru (GAP 4.2.4)
 *  - KVKK erişim kaydı ve denetim kütüğü (§8.4)
 *
 * Aynı mantığı sakin portalı ve mobil de tüketecek; iki kopya kalmadı.
 */

const RESIDENT_ROLES = [
  "owner",
  "tenant_resident",
  "staff",
  "auditor",
  "accountant",
] as const;
const RELATIONS = ["owner", "tenant"] as const;
const TRANSFER_POLICIES = ["owner", "next_tenant", "keep"] as const;

/* ------------------------------------------------------------------ *
 * Sakin oluşturma
 * ------------------------------------------------------------------ */

const residentSchema = z.object({
  firstName: requiredText(2, 80),
  lastName: requiredText(2, 80),
  phone: phoneField,
  email: emailField,
  tckn: tcknField,
  role: z.enum(RESIDENT_ROLES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  locale: z.enum(["tr", "en", "ar", "ru"]).default("tr"),
  whatsappOptIn: checkboxField,
  /** KVKK aydınlatma onayı — kayıt için zorunlu (md.10). */
  kvkkAcknowledged: checkboxField,
  emergencyContactName: optionalText(120),
  emergencyContactPhone: phoneField,
  /** Boş = seçilmedi/silindi. Sunucu bunu NULL'lama olarak yorumluyor. */
  bloodType: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z
      .enum(BLOOD_TYPES, { errorMap: () => ({ message: V.invalidSelection }) })
      .optional(),
  ),
  /** Sağlık verisi açık rızası (KVKK md.6/3) — kan grubu doluysa zorunlu. */
  healthDataConsent: checkboxField,
  notes: optionalText(1000),

  /** İlk ilişki (isteğe bağlı): birim + rol + başlangıç. */
  unitId: optionalUuidField,
  /*
   * "none" = birim ilişkisi kurulmasın.
   *
   * BURADA "vacant" YAZIYORDU ve form hiçbir zaman o değeri göndermiyordu:
   * radyo grubu `owner | tenant | none` üretiyor. Sonuç, "bağımsız bölüm yok"
   * seçildiğinde şemanın patlaması ve formun "işaretli alanları düzeltin"
   * deyip hangi alanın hatalı olduğunu **göstermemesiydi** (hata `relation`
   * alanına düşüyordu, ekranda o adla bir alan yoktu). `vacant` sözcüğü
   * birimin `ownershipType` sözlüğünden geliyor; sakin ilişkisiyle karışmış.
   *
   * `errorMap` de eklendi: aksi halde ham Zod metni ("Invalid enum value…")
   * çeviri anahtarına sarılıp kullanıcıya olduğu gibi gösteriliyordu.
   */
  relation: z
    .enum(["owner", "tenant", "none"], {
      errorMap: () => ({ message: V.invalidSelection }),
    })
    .optional(),
  ownershipPct: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? 100
        : Number(String(value).replace(",", ".")),
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
    async ({ input }) => {
      const t = await getTranslations("app.residents");

      // İki kural sunucuda da zorlanıyor; burada tekrarlanmalarının sebebi
      // kullanıcıya **alan bazlı** hata gösterebilmek — API'nin tek mesajı
      // hangi kutunun kırmızı olacağını söylemez.
      if (!input.kvkkAcknowledged) {
        return errorState(t("kvkkRequired"), {
          kvkkAcknowledged: [t("kvkkRequired")],
        });
      }
      if (!input.phone && !input.email) {
        return errorState(t("contactRequired"), {
          phone: [t("contactRequired")],
          email: [t("contactRequired")],
        });
      }
      // Sunucu bunu `consent_required:health` ile zaten reddediyor; burada
      // tekrarlanmasının sebebi hangi kutunun kırmızı olacağını söyleyebilmek.
      if (input.bloodType && !input.healthDataConsent) {
        return errorState(t("healthConsentRequired"), {
          healthDataConsent: [t("healthConsentRequired")],
        });
      }

      const created = await apiPost(
        "/v1/panel/residents",
        {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: input.email,
          tckn: input.tckn,
          role: input.role,
          locale: input.locale,
          whatsappOptIn: input.whatsappOptIn,
          kvkkAcknowledged: input.kvkkAcknowledged,
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          bloodType: input.bloodType ?? null,
          healthDataConsent: input.healthDataConsent,
          notes: input.notes,
          // "none" bir ilişki değil, ilişkisizlik: API'ye gönderilmez.
          unitId: input.relation === "none" ? null : input.unitId,
          relation: input.relation === "none" ? null : input.relation,
          ownershipPct: input.ownershipPct,
          startDate: input.startDate,
          debtTransferPolicy: input.debtTransferPolicy,
        },
        residentSaveResult,
      );

      const name = `${input.firstName} ${input.lastName}`;
      return okState(
        // Mevcut kişiyi siteye bağlamak ile yeni kişi açmak farklı olaylar;
        // yönetici hangisinin olduğunu bilmeli.
        created.linkedExisting
          ? t("linkedExisting", { name })
          : t("created", { name }),
        {
          redirectTo: `/panel/sakinler/${created.id}`,
          data: { id: created.id },
        },
      );
    },
  );
}

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
  role: z.enum(RESIDENT_ROLES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  locale: z.enum(["tr", "en", "ar", "ru"]).default("tr"),
  whatsappOptIn: checkboxField,
  emergencyContactName: optionalText(120),
  emergencyContactPhone: phoneField,
  /** Boş = seçilmedi/silindi. Sunucu bunu NULL'lama olarak yorumluyor. */
  bloodType: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z
      .enum(BLOOD_TYPES, { errorMap: () => ({ message: V.invalidSelection }) })
      .optional(),
  ),
  /** Sağlık verisi açık rızası (KVKK md.6/3) — kan grubu doluysa zorunlu. */
  healthDataConsent: checkboxField,
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
    async ({ input }) => {
      const t = await getTranslations("app.residents");

      if (!input.phone && !input.email) {
        return errorState(t("contactRequired"), {
          phone: [t("contactRequired")],
          email: [t("contactRequired")],
        });
      }
      // Sunucu bunu `consent_required:health` ile zaten reddediyor; burada
      // tekrarlanmasının sebebi hangi kutunun kırmızı olacağını söyleyebilmek.
      if (input.bloodType && !input.healthDataConsent) {
        return errorState(t("healthConsentRequired"), {
          healthDataConsent: [t("healthConsentRequired")],
        });
      }

      await apiPatch(
        `/v1/panel/residents/${input.id}`,
        {
          id: input.id,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          email: input.email,
          // Boş bırakmak silme değil: API yalnız yeni değer geldiğinde yazıyor.
          tckn: input.tckn,
          role: input.role,
          locale: input.locale,
          whatsappOptIn: input.whatsappOptIn,
          emergencyContactName: input.emergencyContactName,
          emergencyContactPhone: input.emergencyContactPhone,
          bloodType: input.bloodType ?? null,
          healthDataConsent: input.healthDataConsent,
          notes: input.notes,
        },
        residentSaveResult,
      );

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
  relation: z.enum(RELATIONS, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  ownershipPct: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined
        ? 100
        : Number(String(value).replace(",", ".")),
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
      meta: {
        action: "occupancy_created",
        resource: "unit_occupancy",
      },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.residents");

      await apiPost(
        "/v1/panel/residents/occupancy",
        {
          userId: input.userId,
          unitId: input.unitId,
          relation: input.relation,
          ownershipPct: input.ownershipPct,
          startDate: input.startDate,
          debtTransferPolicy: input.debtTransferPolicy,
          contractUrl: input.contractUrl,
        },
        z.object({ id: z.string().uuid() }),
      );

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
  transferTo: z.enum(TRANSFER_POLICIES, {
    errorMap: () => ({ message: V.invalidSelection }),
  }),
  reason: optionalText(500),
});

export interface EndOccupancyResult {
  transferredDebtCount: number;
  transferredKurus: number;
}

/**
 * Kiracı ayrılma akışı — GAP 4.2.4.
 *
 * Devir motoru (borcun malike geçmesi ya da sonraki kiracıya ertelenmesi)
 * `apps/api`'de. Buradaki iş, sonucu kullanıcının anlayacağı cümleye
 * çevirmek: "kiracı çıktı" ile "kiracı çıktı, 4 borç malike geçti" farklı
 * şeyler ve yönetici hangisinin olduğunu görmeli.
 */
export async function endOccupancy(
  _previous: ActionState<EndOccupancyResult>,
  formData: FormData,
): Promise<ActionState<EndOccupancyResult>> {
  return runAction(
    {
      permission: "resident:write",
      schema: endOccupancySchema,
      meta: {
        action: "occupancy_ended",
        resource: "unit_occupancy",
      },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.residents");

      const result = await apiPatch(
        `/v1/panel/residents/occupancy/${input.occupancyId}/end`,
        {
          endDate: input.endDate,
          transferTo: input.transferTo,
          reason: input.reason,
        },
        occupancyEndResult,
      );

      return okState(
        input.transferTo === "owner"
          ? t("occupancyEndedTransferred", {
              count: result.transferredDebtCount,
            })
          : result.pending
            ? t("occupancyEndedPending")
            : t("occupancyEnded"),
        {
          data: {
            transferredDebtCount: result.transferredDebtCount,
            transferredKurus: result.transferredMinor,
          },
        },
      );
    },
  );
}

/* ------------------------------------------------------------------ *
 * Toplu işlemler
 * ------------------------------------------------------------------ */

export interface BulkResult {
  ok: boolean;
  message: string;
}

/**
 * Sakini siteden çıkarır.
 *
 * `users` kaydı silinmez — kişi başka sitelerde de kayıtlı olabilir. Açık
 * borcu olan atlanır; kaç kişinin atlandığı kullanıcıya söylenir, sessizce
 * yutulmaz.
 */
export async function removeResidents(ids: string[]): Promise<BulkResult> {
  await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  const result = await apiPost(
    "/v1/panel/residents/remove",
    { ids: targets },
    residentRemoveResult,
  );

  return result.skipped === 0
    ? { ok: true, message: t("bulkRemoved", { count: result.removed }) }
    : {
        ok: true,
        message: t("bulkRemovedPartial", {
          count: result.removed,
          skipped: result.skipped,
        }),
      };
}

/** WhatsApp opt-in durumunu toplu değiştir (rıza kaydıyla birlikte). */
export async function setWhatsappOptIn(
  ids: string[],
  optIn: boolean,
): Promise<BulkResult> {
  await requirePermission("resident:write");
  const t = await getTranslations("app.residents");
  const targets = asArray(ids);
  if (targets.length === 0) return { ok: false, message: t("selectionEmpty") };

  await apiPost(
    "/v1/panel/residents/whatsapp",
    { ids: targets, optIn },
    z.object({ affected: z.number().int() }),
  );
  return { ok: true, message: optIn ? t("optInDone") : t("optOutDone") };
}

/**
 * TCKN çakışma kontrolü — form ipucu için.
 *
 * TCKN buradan **çıkmıyor**: sorgu parametre olarak gidiyor, karşılaştırma
 * sunucuda blind index üzerinde yapılıyor ve yalnız "kim" bilgisi dönüyor.
 */
export async function findResidentByTckn(
  tckn: string,
): Promise<{ id: string; name: string } | null> {
  await requirePermission("resident:read");
  if (tckn.replace(/\D+/g, "").length !== 11) return null;

  const result = await apiGet(
    `/v1/panel/residents/tckn-lookup?tckn=${encodeURIComponent(tckn)}`,
    tcknLookupResult,
  );
  return result.found && result.id
    ? { id: result.id, name: result.name ?? "" }
    : null;
}
