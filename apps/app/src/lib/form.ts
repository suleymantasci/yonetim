import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { AppError, isValidIban, isValidTckn, normalizePhone } from "@yonetim/core";
import type { Permission } from "@yonetim/core";

import { audit } from "./audit";
import { requirePermission, type AppContext } from "./context";

/**
 * SERVER ACTION + FORM STANDARDI — GAP TD-01 / Sprint 1.
 *
 * MİMARİ KARAR: react-hook-form kullanılmıyor.
 *
 * Neden: React 19 `useActionState` + `<form action={…}>` ikilisi, doğrulamayı
 * tek yerde (sunucuda, Zod ile) tutmamıza izin veriyor. RHF eklemek aynı
 * kuralları istemcide ikinci kez yazmak, ~14 kB bundle ve JS kapalıyken
 * çalışmayan bir form demekti. Bunun yerine:
 *
 *   1. Şema **tek kaynak**: `z.object(...)` hem alanları hem mesaj kodlarını taşır.
 *   2. Hata mesajları **kod** olarak üretilir (`required`, `minLength|3`) ve
 *      `common.validation` altından kullanıcının dilinde çevrilir — sunucu
 *      hiçbir zaman sabit Türkçe metin döndürmez.
 *   3. Alan hataları `fieldErrors` ile alan adına göre döner; istemci bunları
 *      ilgili `Field` altında gösterir (anlık değil ama **doğru** doğrulama).
 *   4. İstemci tarafı anlık ipuçları `packages/ui` alanlarında (TCKN/IBAN/telefon)
 *      zaten var; onlar yalnızca kolaylık, bağlayıcı karar burada verilir.
 *
 * Her aksiyon `runAction` içinden geçer: yetki kontrolü, şema doğrulaması,
 * denetim kütüğü ve hata zarflama tek yerde toplanır.
 */

export interface ActionState<TData = undefined> {
  status: "idle" | "ok" | "error";
  /** Kullanıcıya gösterilecek çevrilmiş özet mesaj. */
  message?: string;
  /** Alan adı → çevrilmiş hata mesajları. */
  fieldErrors?: Record<string, string[]>;
  /** Başarıdan sonra istemcinin yönlendirmesi gereken adres. */
  redirectTo?: string;
  data?: TData;
}

export function idleState<T = undefined>(): ActionState<T> {
  return { status: "idle" };
}

export function okState<T = undefined>(
  message: string,
  extra: { redirectTo?: string; data?: T } = {},
): ActionState<T> {
  return { status: "ok", message, ...extra };
}

export function errorState<T = undefined>(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionState<T> {
  return { status: "error", message, fieldErrors };
}

/* ------------------------------------------------------------------ *
 * Mesaj kodları
 * ------------------------------------------------------------------ */

/**
 * Doğrulama mesajı kodları. `|` ile parametre taşınır:
 * `minLength|3` → `common.validation.minLength` + `{count: 3}`.
 */
export const V = {
  required: "required",
  invalidEmail: "invalidEmail",
  invalidPhone: "invalidPhone",
  invalidAmount: "invalidAmount",
  invalidIban: "invalidIban",
  invalidTckn: "invalidTckn",
  invalidDate: "invalidDate",
  invalidPeriod: "invalidPeriod",
  invalidSelection: "invalidSelection",
  min: (count: number) => `minLength|${count}`,
  max: (count: number) => `maxLength|${count}`,
  minValue: (value: number) => `minValue|${value}`,
  maxValue: (value: number) => `maxValue|${value}`,
} as const;

type Translator = (key: string, values?: Record<string, string | number>) => string;

function translateCode(code: string, t: Translator): string {
  const [key, raw] = code.split("|");
  if (!key) return t("required");
  const count = raw === undefined ? undefined : Number(raw);
  try {
    return count === undefined || Number.isNaN(count) ? t(key) : t(key, { count });
  } catch {
    // Bilinmeyen kod (üçüncü taraf şemadan gelen ham Zod mesajı) — yutmayız,
    // ama kullanıcıya jenerik "zorunlu" mesajı göstermek yanıltıcı olur.
    return code;
  }
}

/** Zod hatalarını alan adına göre gruplanmış çevrilmiş mesajlara dönüştürür. */
export function translateIssues(
  error: z.ZodError,
  t: Translator,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "_form";
    const message = translateCode(issue.message, t);
    (result[field] ??= []).push(message);
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Yeniden kullanılabilir alan şemaları
 * ------------------------------------------------------------------ */

const trimmed = (value: unknown) => (typeof value === "string" ? value.trim() : value);

/** Boş string'i `undefined`'a çeviren isteğe bağlı metin. */
export function optionalText(max: number) {
  return z.preprocess(
    (value) => {
      const text = trimmed(value);
      return text === "" || text === null ? undefined : text;
    },
    z.string().max(max, V.max(max)).optional(),
  );
}

export function requiredText(min: number, max: number) {
  return z.preprocess(
    trimmed,
    z
      .string({ required_error: V.required, invalid_type_error: V.required })
      .min(min, min === 1 ? V.required : V.min(min))
      .max(max, V.max(max)),
  );
}

/** Kuruş cinsinden tam sayı (MoneyInput gizli alanı bunu üretir). */
export function kurusField({ min = 0, max = 10_000_000_00 } = {}) {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : Number(value)),
    z
      .number({ required_error: V.required, invalid_type_error: V.invalidAmount })
      .int(V.invalidAmount)
      .min(min, min > 0 ? V.minValue(min) : V.invalidAmount)
      .max(max, V.maxValue(max)),
  );
}

export function intField({ min, max }: { min: number; max: number }) {
  return z.preprocess(
    (value) => (value === "" || value === null ? undefined : Number(value)),
    z
      .number({ required_error: V.required, invalid_type_error: V.invalidAmount })
      .int(V.invalidAmount)
      .min(min, V.minValue(min))
      .max(max, V.maxValue(max)),
  );
}

/** Ondalık sayı — alan m², arsa payı, çarpan gibi alanlar için. */
export function decimalField({ min, max }: { min: number; max: number }) {
  return z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) return undefined;
      // TR klavye virgülünü kabul et: "72,5" → 72.5
      return Number(String(value).replace(",", "."));
    },
    z
      .number({ invalid_type_error: V.invalidAmount })
      .min(min, V.minValue(min))
      .max(max, V.maxValue(max))
      .optional(),
  );
}

/** E.164 telefon. PhoneInput zaten normalize eder; burası son savunma hattı. */
export const phoneField = z.preprocess(
  (value) => {
    const text = trimmed(value);
    if (text === "" || text === null || text === undefined) return undefined;
    return normalizePhone(String(text)) ?? String(text);
  },
  z
    .string()
    .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), V.invalidPhone)
    .optional(),
);

export const emailField = z.preprocess(
  (value) => {
    const text = trimmed(value);
    return text === "" || text === null ? undefined : String(text).toLowerCase();
  },
  z.string().email(V.invalidEmail).max(255, V.max(255)).optional(),
);

export const tcknField = z.preprocess(
  (value) => {
    const text = trimmed(value);
    return text === "" || text === null ? undefined : String(text);
  },
  z.string().refine(isValidTckn, V.invalidTckn).optional(),
);

export const ibanField = z.preprocess(
  (value) => {
    const text = trimmed(value);
    if (text === "" || text === null || text === undefined) return undefined;
    return String(text).replace(/\s+/g, "").toUpperCase();
  },
  z.string().refine(isValidIban, V.invalidIban).optional(),
);

/** `<input type="date">` → Date. Saat İstanbul gününün başına sabitlenir. */
export const dateField = z.preprocess(
  (value) => {
    const text = trimmed(value);
    if (text === "" || text === null || text === undefined) return undefined;
    const parsed = new Date(`${String(text)}T00:00:00+03:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  },
  z.date({ required_error: V.required, invalid_type_error: V.invalidDate }),
);

export const optionalDateField = dateField.optional();

/** `<input type="month">` → "2026-07". */
export const periodField = z.preprocess(
  trimmed,
  z
    .string({ required_error: V.required })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, V.invalidPeriod),
);

export const uuidField = z.string().uuid(V.invalidSelection);

export const optionalUuidField = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().uuid(V.invalidSelection).optional(),
);

/** Onay kutusu: HTML "on"/eksik → boolean. */
/**
 * Onay kutusu ve onay butonu.
 *
 * `"on"` tarayıcının işaretli checkbox için gönderdiği değer. `"1"`/`"true"`
 * ise `name`/`value` taşıyan gönder butonlarından geliyor (iki adımlı
 * sihirbazlarda onay adımı böyle işaretleniyor).
 */
export const checkboxField = z.preprocess(
  (value) => value === "on" || value === "true" || value === "1",
  z.boolean(),
);

/* ------------------------------------------------------------------ *
 * FormData → düz nesne
 * ------------------------------------------------------------------ */

/**
 * `FormData`'yı Zod'un beklediği düz nesneye çevirir.
 *
 * Aynı ada birden fazla değer varsa dizi üretilir (Combobox çoklu seçim,
 * CheckboxGroup). Dosya alanları atlanır — onlar ayrı akıştan geçer.
 */
export function formToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else result[key] = [existing, value];
  }
  return result;
}

/** Tek değer beklenen alanda dizi gelirse ilkini al; çoklu alanı diziye zorla. */
export function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v !== "");
  if (typeof value === "string" && value !== "") return [value];
  return [];
}

/* ------------------------------------------------------------------ *
 * Aksiyon sarmalayıcısı
 * ------------------------------------------------------------------ */

export interface ActionMeta {
  /** Denetim kütüğü aksiyon adı (`unit_created` gibi). */
  action: string;
  resource: string;
  /**
   * Denetim kaydını **kim** yazıyor?
   *
   * Göç ettikten sonra kütüğü `apps/api` yazıyor (MIMARI-PLAN §8.4) — çünkü
   * hangi kaydın gerçekten değiştiğini yalnız servis biliyor. Böyle aksiyonlar
   * `audit: "api"` der ve buradaki ikinci kayıt atlanır; yoksa her işlem kütükte
   * iki satır bırakırdı.
   */
  audit?: "app" | "api";
}

/**
 * Standart CRUD Server Action gövdesi.
 *
 * Sorumlulukları: yetki → doğrulama → iş mantığı → denetim → durum zarfı.
 * İş mantığı `handler` içinde kalır; her aksiyonun tekrar etmesi gereken
 * hiçbir şey handler'a sızmaz.
 *
 * Hata yönetimi: beklenen hatalar `ActionError` fırlatır (çevrilmiş mesaj
 * taşır); beklenmeyen hatalar loglanır ve kullanıcıya jenerik mesaj döner —
 * veritabanı hata metni asla arayüze çıkmaz.
 */
export class ActionError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export async function runAction<TSchema extends z.ZodTypeAny, TData = undefined>(
  options: {
    permission: Permission;
    schema: TSchema;
    meta: ActionMeta;
  },
  formData: FormData,
  handler: (args: {
    ctx: AppContext;
    input: z.output<TSchema>;
    /** Handler bu kimliği döndürdüğünde denetim kaydına yazılır. */
    setResourceId: (id: string) => void;
  }) => Promise<ActionState<TData>>,
): Promise<ActionState<TData>> {
  const tValidation = await getTranslations("common.validation");
  const tError = await getTranslations("common.error");

  let ctx: AppContext;
  try {
    ctx = await requirePermission(options.permission);
  } catch {
    return errorState(tError("forbidden"));
  }

  const parsed = options.schema.safeParse(formToObject(formData));
  if (!parsed.success) {
    return errorState(
      tError("validationFailed"),
      translateIssues(parsed.error, tValidation as unknown as Translator),
    );
  }

  let resourceId: string | undefined;

  try {
    const state = await handler({
      ctx,
      input: parsed.data,
      setResourceId: (id) => {
        resourceId = id;
      },
    });

    if (state.status === "ok" && (options.meta.audit ?? "app") === "app") {
      await audit(ctx, {
        action: options.meta.action,
        resource: options.meta.resource,
        resourceId,
      });
    }
    return state;
  } catch (error) {
    if (error instanceof ActionError) {
      return errorState(error.message, error.fieldErrors);
    }
    // API'den gelen hata zarfı `AppError`'a indirgeniyor (lib/api/server.ts).
    // Mesajı kullanıcıya gösterilebilir: sunucu onu zaten kullanıcı için üretti
    // ve veritabanı ayrıntısı içermiyor.
    if (error instanceof AppError) {
      return errorState(error.message, toFieldErrors(error.details));
    }
    // Beklenmeyen hata: sunucuya yaz, kullanıcıya sızdırma.
    console.error(`[action:${options.meta.action}]`, error);
    return errorState(tError("internal"));
  }
}

/**
 * API'nin `validation_failed` ayrıntısı Zod `flatten()` çıktısıdır; alan bazlı
 * hataları formun beklediği şekle çevirir. Tanınmayan biçimde `undefined` döner
 * ve yalnız özet mesaj gösterilir.
 */
function toFieldErrors(details: unknown): Record<string, string[]> | undefined {
  if (!details || typeof details !== "object") return undefined;
  const flat = (details as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors;
  if (!flat) return undefined;

  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (Array.isArray(value) && value.length > 0) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
