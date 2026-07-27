import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";

import { AppError, errors } from "@yonetim/core";

import {
  parsePagination,
  toListEnvelope,
} from "../apps/api/src/public/public-v1.pagination";
import { OPENAPI_V1_DOCUMENT } from "../apps/api/src/public/public-v1.openapi";

/**
 * A5 ÇIKIŞ ÖLÇÜTÜ — `/api/v1` DIŞ SÖZLEŞMESİ DEĞİŞMEDİ (MIMARI-PLAN §9.1).
 *
 * Uçlar Next route handler'larından `apps/api`'ye taşındı. Taşıma "aynı işi
 * yapıyor" demek yeterli değil: bu yüzeyin istemcileri bizim repomuzda değil
 * (muhasebe yazılımları, yönetim şirketlerinin panelleri). Bir alan adının
 * değişmesi ya da bir zarfın kaybolması, bizim testlerimizin göremeyeceği
 * yerlerde kırılma üretir.
 *
 * Bu yüzden zarf, sayfalama ve hata biçimi burada **beklenen çıktıya karşı**
 * sabitleniyor. Veritabanı gerekmiyor — sınanan şey sorgunun sonucu değil,
 * sonucun **şekli**.
 *
 * Uçların gerçek verisiyle uçtan uca doğrulaması `tests/integration/` altında;
 * burası her `pnpm test` çalıştırmasında koşan hızlı kapı.
 */

/* ------------------------------------------------------------------ *
 * Sayfalama
 * ------------------------------------------------------------------ */

describe("/api/v1 sayfalama sözleşmesi", () => {
  it("varsayılanlar değişmedi: sayfa 1, 50 kayıt", () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 50 });
  });

  it("parametre adları İngilizce kalıyor (panelin Türkçe adları değil)", () => {
    const parsed = parsePagination({
      page: "3",
      pageSize: "10",
      q: "kat",
      sort: "dueDate",
      direction: "asc",
    });
    expect(parsed).toEqual({
      page: 3,
      pageSize: 10,
      q: "kat",
      sort: "dueDate",
      direction: "asc",
    });

    // Türkçe adlar bu yüzeyde **tanınmıyor**: tanınsaydı iki isim seti aynı
    // anlama gelir ve hangisinin sözleşme olduğu belirsizleşirdi.
    expect(parsePagination({ sayfa: "3", adet: "10" })).toEqual({
      page: 1,
      pageSize: 50,
    });
  });

  it("boş string parametreler yok sayılıyor", () => {
    // `?q=&sort=` gönderen istemci, hiç göndermemişle aynı sonucu almalı;
    // aksi halde boş arama terimi `ilike '%%'` üretip filtreyi sessizce
    // anlamsızlaştırırdı.
    expect(parsePagination({ q: "", sort: "", direction: "" })).toEqual({
      page: 1,
      pageSize: 50,
    });
  });

  it("pageSize üst sınırı 200 — tüm tablo tek istekte çekilemiyor", () => {
    expect(() => parsePagination({ pageSize: "500" })).toThrow(ZodError);
  });

  it("geçersiz sayfa numarası sessizce düzeltilmiyor, reddediliyor", () => {
    expect(() => parsePagination({ page: "0" })).toThrow(ZodError);
    expect(() => parsePagination({ page: "-1" })).toThrow(ZodError);
  });
});

/* ------------------------------------------------------------------ *
 * Liste zarfı
 * ------------------------------------------------------------------ */

describe("/api/v1 liste zarfı", () => {
  it("`{data, meta}` biçimi ve `pageCount` türetimi birebir korunuyor", () => {
    expect(
      toListEnvelope([{ id: "a" }], { page: 2, pageSize: 20, total: 41 }),
    ).toEqual({
      data: [{ id: "a" }],
      meta: { page: 2, pageSize: 20, total: 41, pageCount: 3 },
    });
  });

  it("boş sonuçta pageCount 1 — 'sayfa 1 / 0' gösterimi üretilmiyor", () => {
    expect(
      toListEnvelope([], { page: 1, pageSize: 50, total: 0 }).meta.pageCount,
    ).toBe(1);
  });

  it("meta yalnız dört alan taşıyor — alan eklemek de sözleşmeyi değiştirir", () => {
    const { meta } = toListEnvelope([], { page: 1, pageSize: 50, total: 0 });
    expect(Object.keys(meta).sort()).toEqual([
      "page",
      "pageCount",
      "pageSize",
      "total",
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Hata zarfı
 * ------------------------------------------------------------------ */

describe("/api/v1 hata zarfı", () => {
  it("`{error:{code,message,details}}` biçimi korunuyor", () => {
    const json = errors.notFound("Bağımsız bölüm bulunamadı.").toJSON();
    expect(json).toEqual({
      error: {
        code: "not_found",
        message: "Bağımsız bölüm bulunamadı.",
        details: undefined,
      },
    });
  });

  it("gövdede requestId YOK — izlenebilirlik başlıkla sağlanıyor", () => {
    // Alan eklemek de sözleşmeyi değiştirmektir; katı bir istemci ayrışabilir.
    // `X-Request-Id` başlığı gövdeye dokunmadan aynı izi taşıyor.
    const json = errors.internal().toJSON() as Record<string, unknown>;
    expect(JSON.stringify(json)).not.toContain("requestId");
  });

  it("doğrulama hatası Zod `flatten()` çıktısını `details` içinde taşıyor", () => {
    const schema = z.object({ number: z.string().min(1) });
    const parsed = schema.safeParse({});
    expect(parsed.success).toBe(false);

    const validation = errors.validation(
      "Girdi doğrulaması başarısız.",
      (parsed as { error: ZodError }).error.flatten(),
    );
    const json = validation.toJSON() as {
      error: { details: { fieldErrors: Record<string, string[]> } };
    };
    expect(json.error.details.fieldErrors.number).toBeTruthy();
  });

  it("HTTP durum kodları sabit", () => {
    const cases: Array<[AppError, number]> = [
      [errors.unauthorized(), 401],
      [errors.forbidden(), 403],
      [errors.notFound(), 404],
      [errors.conflict("x"), 409],
      [errors.rateLimited(), 429],
      [errors.internal(), 500],
    ];
    for (const [error, status] of cases) expect(error.status).toBe(status);
  });
});

/* ------------------------------------------------------------------ *
 * OpenAPI açıklaması
 * ------------------------------------------------------------------ */

describe("/api/v1 OpenAPI açıklaması", () => {
  it("yayınlanmış yollar kaybolmadı", () => {
    expect(Object.keys(OPENAPI_V1_DOCUMENT.paths).sort()).toEqual([
      "/debts",
      "/expenses",
      "/residents",
      "/units",
      "/units/{id}",
    ]);
  });

  it("sunucu tabanı `/api/v1` — taşıma adresi değiştirmedi", () => {
    expect(OPENAPI_V1_DOCUMENT.servers[0]?.url).toBe("/api/v1");
  });

  it("sakin şeması ham telefon taşımıyor (KVKK veri minimizasyonu)", () => {
    const resident = OPENAPI_V1_DOCUMENT.components.schemas.Resident.properties;
    expect(resident).toHaveProperty("phoneMasked");
    expect(resident).not.toHaveProperty("phone");
    expect(resident).not.toHaveProperty("tckn");
  });

  it("sakinlerde yazma ucu yok — KVKK onayı API anahtarıyla verilemez", () => {
    expect(Object.keys(OPENAPI_V1_DOCUMENT.paths["/residents"])).toEqual([
      "get",
    ]);
  });
});
