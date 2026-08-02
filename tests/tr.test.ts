import { describe, expect, it } from "vitest";

import {
  addMonths, comparePeriods, dueDateFor, formatKurus,
  isValidIban, isValidTckn, isValidVkn, mapImport, maskIban, maskPhone, maskTckn,
  nextAllowedSendTime, normalizePhone, parsePeriodKey, periodKey, slugify, trLower, trUpper,
} from "@yonetim/core";
import { blindIndex, decryptField, encryptField } from "@yonetim/core/crypto";

describe("TCKN doğrulama", () => {
  it("geçerli numarayı kabul eder", () => {
    // Algoritmik olarak geçerli test numarası
    expect(isValidTckn("10000000146")).toBe(true);
  });
  it("hatalı kontrol basamağını reddeder", () => {
    expect(isValidTckn("10000000147")).toBe(false);
  });
  it("sıfırla başlayanı ve kısa girdiyi reddeder", () => {
    expect(isValidTckn("01234567890")).toBe(false);
    expect(isValidTckn("123")).toBe(false);
  });
});

describe("VKN doğrulama", () => {
  it("10 haneli olmayanı reddeder", () => {
    expect(isValidVkn("12345")).toBe(false);
    expect(isValidVkn("12345678901")).toBe(false);
  });
});

describe("IBAN doğrulama", () => {
  it("mod-97 geçerli TR IBAN'ı kabul eder", () => {
    expect(isValidIban("TR330006100519786457841326")).toBe(true);
  });
  it("bozuk IBAN'ı reddeder", () => {
    expect(isValidIban("TR330006100519786457841327")).toBe(false);
    expect(isValidIban("DE89370400440532013000")).toBe(false);
  });
});

describe("telefon normalizasyonu", () => {
  it("farklı yazımları E.164'e çevirir", () => {
    expect(normalizePhone("0532 000 00 00")).toBe("+905320000000");
    expect(normalizePhone("+90 532 000 00 00")).toBe("+905320000000");
    expect(normalizePhone("905320000000")).toBe("+905320000000");
    expect(normalizePhone("00905320000000")).toBe("+905320000000");
  });
  it("geçersiz numarayı reddeder", () => {
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("KVKK maskeleme", () => {
  it("telefon, TCKN ve IBAN'ı maskeler", () => {
    expect(maskPhone("+905320000000")).toContain("***");
    expect(maskTckn("10000000146")).toBe("100******46");
    expect(maskIban("TR330006100519786457841326")).toMatch(/^TR3300\*+1326$/);
  });
});

describe("Türkçe metin yardımcıları", () => {
  it("Türkçe karakterlerle slug üretir", () => {
    expect(slugify("Çağrı Şükrü Ilgaz Apartmanı")).toBe("cagri-sukru-ilgaz-apartmani");
  });
  it("i/I dönüşümünü doğru yapar", () => {
    expect(trUpper("istanbul")).toBe("İSTANBUL");
    expect(trLower("IĞDIR")).toBe("ığdır");
  });
});

describe("dönem hesapları", () => {
  it("dönem anahtarını üretir ve ayrıştırır", () => {
    expect(periodKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(parsePeriodKey("2026-03")).toEqual({ year: 2026, month: 3 });
    expect(parsePeriodKey("2026-13")).toBeNull();
  });
  it("ay ekler ve yıl geçişini yönetir", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("dönemleri karşılaştırır", () => {
    expect(comparePeriods({ year: 2026, month: 1 }, { year: 2026, month: 2 })).toBeLessThan(0);
  });
  it("ayda olmayan vade gününü ayın sonuna çeker", () => {
    const due = dueDateFor({ year: 2026, month: 2 }, 31);
    expect(due.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("sessiz saat kuralı (SPEC 8.1)", () => {
  const opts = { quietStart: 22, quietEnd: 8, deferHour: 9 };

  it("gece gelen acil olmayan bildirimi sabaha erteler", () => {
    const at23 = new Date("2026-03-10T20:00:00Z"); // TR 23:00
    const scheduled = nextAllowedSendTime(at23, { ...opts, urgent: false });
    expect(scheduled.getTime()).toBeGreaterThan(at23.getTime());
  });

  it("acil bildirimi hemen gönderir", () => {
    const at23 = new Date("2026-03-10T20:00:00Z");
    expect(nextAllowedSendTime(at23, { ...opts, urgent: true })).toEqual(at23);
  });

  it("gün içi bildirimi ertelemez", () => {
    const at14 = new Date("2026-03-10T11:00:00Z"); // TR 14:00
    expect(nextAllowedSendTime(at14, { ...opts, urgent: false })).toEqual(at14);
  });
});

describe("alan bazlı şifreleme (SPEC 5.6)", () => {
  const key = "a".repeat(64);

  it("şifreler ve çözer", () => {
    const enc = encryptField("10000000146", key, "tenant-1");
    expect(enc).not.toContain("10000000146");
    expect(decryptField(enc, key, "tenant-1")).toBe("10000000146");
  });

  it("başka tenant anahtarıyla çözülemez", () => {
    const enc = encryptField("10000000146", key, "tenant-1");
    expect(() => decryptField(enc, key, "tenant-2")).toThrow();
  });

  it("aynı değer için farklı şifreli metin üretir (IV)", () => {
    expect(encryptField("x", key, "t")).not.toBe(encryptField("x", key, "t"));
  });

  it("blind index eşitlik sorgusu için deterministiktir (tenant scope)", () => {
    expect(blindIndex("10000000146", key, "t1")).toBe(
      blindIndex("10000000146", key, "t1"),
    );
  });

  it("blind index farklı tenant için farklı sonuç üretir", () => {
    expect(blindIndex("10000000146", key, "t1")).not.toBe(
      blindIndex("10000000146", key, "t2"),
    );
  });
});

describe("para biçimlendirme", () => {
  it("TRY olarak biçimlendirir", () => {
    expect(formatKurus(125_050)).toContain("1.250,50");
  });
});

describe("veri aktarımı (SPEC 3.11)", () => {
  it("Türkçe başlıkları tanır ve satırları eşler", () => {
    const csv = [
      "Blok;Daire No;Kat;Brüt m2;Arsa Payı;Malik;Malik Telefon;Bakiye",
      "A Blok;1;1;95,50;0,041667;Ali Veli;0532 000 00 01;1.250,00",
      "A Blok;2;1;110,00;0,048;Ayşe Yılmaz;0532 000 00 02;0",
    ].join("\n");

    const result = mapImport(csv, "apsiyon");
    expect(result.units).toHaveLength(2);
    expect(result.units[0]!.number).toBe("1");
    expect(result.units[0]!.blockName).toBe("A Blok");
    expect(result.units[0]!.areaM2).toBe(95.5);
    expect(result.units[0]!.openingBalanceKurus).toBe(125_000);
    expect(result.summary.blocks).toEqual(["A Blok"]);
  });

  it("daire numarası sütunu yoksa hata verir", () => {
    const result = mapImport("Ad;Soyad\nAli;Veli", "excel");
    expect(result.issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("yinelenen kaydı atlar", () => {
    const csv = "Daire No;Bakiye\n5;100\n5;200";
    const result = mapImport(csv, "excel");
    expect(result.units).toHaveLength(1);
    expect(result.issues.some((i) => i.code === "duplicateUnit")).toBe(true);
  });
});
