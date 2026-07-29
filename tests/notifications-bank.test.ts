import { describe, expect, it } from "vitest";

import { CircuitBreaker, failover, tlToKurus } from "@yonetim/core";
import { estimateMonthlyCostKurus, route, type RecipientProfile } from "@yonetim/notifications";
import { matchTransaction, parseBankCsv, reconcile, type BankTransactionDto } from "@yonetim/bank";
import { smsSegments, deasciify } from "@yonetim/sms";
import { calculateFees, formatReceiptNo, receiptHtml, selectPaymentProvider } from "@yonetim/payment";
import { collectionScore } from "@yonetim/dues";

describe("akıllı kanal yönlendirme (SPEC 8.1)", () => {
  const base: RecipientProfile = {
    userId: "u1",
    phone: "+905320000000",
    email: "a@b.com",
    whatsappOptIn: true,
    marketingOptIn: false,
    hasAppSession: false,
  };

  it("WhatsApp izni varsa WhatsApp kullanır", () => {
    const r = route({ kind: "dues_reminder", recipient: base });
    expect(r.channels).toContain("whatsapp");
    expect(r.channels).not.toContain("sms");
  });

  it("WhatsApp izni yoksa SMS'e düşer", () => {
    const r = route({ kind: "dues_reminder", recipient: { ...base, whatsappOptIn: false } });
    expect(r.channels).toContain("sms");
    expect(r.skippedReasons.length).toBeGreaterThan(0);
  });

  it("telefon yoksa e-postaya düşer", () => {
    const r = route({
      kind: "dues_reminder",
      recipient: { ...base, whatsappOptIn: false, phone: null },
    });
    expect(r.channels).toContain("email");
  });

  it("acil durumda tüm kanalları kullanır", () => {
    const r = route({ kind: "emergency", recipient: base });
    expect(r.channels).toEqual(expect.arrayContaining(["whatsapp", "sms", "email", "in_app"]));
  });

  it("service window içinde ücretsiz serbest metin kullanır", () => {
    const r = route({
      kind: "request_status",
      recipient: base,
      serviceWindowEndsAt: new Date(Date.now() + 3_600_000),
    });
    expect(r.useFreeform).toBe(true);
    expect(r.estimatedCostKurus).toBe(0);
  });

  it("service window dışında ücretli şablon kullanır", () => {
    const r = route({ kind: "dues_reminder", recipient: base, serviceWindowEndsAt: null });
    expect(r.useFreeform).toBe(false);
    expect(r.estimatedCostKurus).toBeGreaterThan(0);
  });

  it("pazarlama izni yoksa yalnızca uygulama içi gösterir", () => {
    const r = route({ kind: "campaign", recipient: base });
    expect(r.channels).toEqual(["in_app"]);
    expect(r.estimatedCostKurus).toBe(0);
  });

  it("SMS kotası dolduysa e-postaya döner", () => {
    const r = route({
      kind: "dues_reminder",
      recipient: { ...base, whatsappOptIn: false },
      smsQuotaExhausted: true,
    });
    expect(r.channels).toContain("email");
    expect(r.channels).not.toContain("sms");
  });

  it("sakin başı aylık maliyet hedefi ~0,50 ₺ civarında kalır (SPEC 8.3)", () => {
    // Hedef senaryo: sakin başına ayda 2 bildirim, %70 WhatsApp izni,
    // WhatsApp trafiğinin %80'i ücretsiz service window içinde.
    const est = estimateMonthlyCostKurus({
      residentCount: 100,
      whatsappOptInRate: 0.7,
      messagesPerResidentPerMonth: 2,
      freeWindowRatio: 0.8,
    });
    expect(est.perResidentKurus).toBeLessThanOrEqual(tlToKurus(0.6));
  });

  it("mesaj sayısı arttıkça maliyet doğrusal büyür", () => {
    const low = estimateMonthlyCostKurus({
      residentCount: 100, whatsappOptInRate: 0.7, messagesPerResidentPerMonth: 2,
    });
    const high = estimateMonthlyCostKurus({
      residentCount: 100, whatsappOptInRate: 0.7, messagesPerResidentPerMonth: 4,
    });
    expect(high.totalKurus).toBeCloseTo(low.totalKurus * 2, -2);
  });
});

describe("SMS uzunluk ve karakter (SPEC 7.3)", () => {
  it("Türkçe karakterli mesaj 70 karakterde bölünür", () => {
    const seg = smsSegments("Merhaba, ödemeniz alındı. Teşekkür ederiz. Iyi günler dileriz efendim.");
    expect(seg.unicode).toBe(true);
  });

  it("ASCII mesaj 160 karaktere sığar", () => {
    const seg = smsSegments("Merhaba, odemeniz alindi. Tesekkur ederiz.");
    expect(seg.unicode).toBe(false);
    expect(seg.parts).toBe(1);
  });

  it("deasciify Türkçe karakterleri indirger", () => {
    expect(deasciify("Şükrü Çağrı İğdır")).toBe("Sukru Cagri Igdir");
  });
});

describe("banka eşleştirme (SPEC 3.10)", () => {
  const candidates = [
    {
      unitId: "u12",
      unitLabel: "12",
      residentNames: ["Ayşe Yılmaz"],
      outstandingKurus: 125_000,
      knownIbans: ["TR330006100519786457841326"],
    },
    {
      unitId: "u5",
      unitLabel: "5",
      residentNames: ["Mehmet Demir"],
      outstandingKurus: 90_000,
    },
  ];

  function tx(over: Partial<BankTransactionDto> = {}): BankTransactionDto {
    return {
      externalId: "x1",
      direction: "in",
      amountKurus: 125_000,
      transactionAt: new Date("2026-03-05"),
      provider: "manual_csv",
      raw: {},
      ...over,
    };
  }

  it("bilinen IBAN + tam tutar ile otomatik eşleşir", () => {
    const r = matchTransaction(
      tx({ counterpartyIban: "TR330006100519786457841326" }),
      candidates,
    );
    expect(r.unitId).toBe("u12");
    expect(r.decision).toBe("auto");
  });

  it("açıklamada daire numarası geçerse eşleşir", () => {
    const r = matchTransaction(
      tx({ description: "AIDAT ODEMESI DAIRE 12", counterparty: "AYSE YILMAZ" }),
      candidates,
    );
    expect(r.unitId).toBe("u12");
    expect(r.decision).toBe("auto");
  });

  it("yalnızca isim eşleşmesinde manuel incelemeye düşer", () => {
    const r = matchTransaction(
      tx({ amountKurus: 40_000, counterparty: "MEHMET DEMIR", description: "HAVALE" }),
      candidates,
    );
    expect(r.unitId).toBe("u5");
    expect(r.decision).toBe("review");
  });

  it("hiçbir ipucu yoksa eşleşmemiş kalır", () => {
    const r = matchTransaction(tx({ amountKurus: 7_777, description: "FAIZ" }), candidates);
    expect(r.decision).toBe("unmatched");
  });

  it("giden hareketi tahsilat saymaz", () => {
    const r = matchTransaction(tx({ direction: "out" }), candidates);
    expect(r.decision).toBe("unmatched");
  });
});

describe("banka CSV ayrıştırma", () => {
  it("Türk bankası formatını ayrıştırır", () => {
    const csv = [
      "Tarih;Aciklama;Tutar;Bakiye",
      "05.03.2026;GONDEREN AYSE YILMAZ AIDAT;1.250,00;15.750,00",
      "06.03.2026;ELEKTRIK FATURASI;-2.300,50;13.449,50",
    ].join("\n");

    const rows = parseBankCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.direction).toBe("in");
    expect(rows[0]!.amountKurus).toBe(125_000);
    expect(rows[1]!.direction).toBe("out");
    expect(rows[1]!.amountKurus).toBe(230_050);
  });
});

describe("mutabakat (SPEC 3.10)", () => {
  it("bankaya yansımayan ödemeyi kritik olarak işaretler", () => {
    const issues = reconcile({
      payments: [
        { id: "p1", amountKurus: 125_000, paidAt: new Date("2026-03-01"), processorRef: "x" },
      ],
      bankTransactions: [],
    });
    expect(issues[0]!.kind).toBe("missing_in_bank");
    expect(issues[0]!.severity).toBe("critical");
  });

  it("sistemde karşılığı olmayan banka girişini uyarır", () => {
    const issues = reconcile({
      payments: [],
      bankTransactions: [
        { id: "b1", amountKurus: 50_000, transactionAt: new Date("2026-03-01"), matchedPaymentId: null },
      ],
    });
    expect(issues[0]!.kind).toBe("missing_in_system");
  });

  it("eşleşen kayıtlarda fark üretmez", () => {
    const issues = reconcile({
      payments: [{ id: "p1", amountKurus: 125_000, paidAt: new Date("2026-03-01"), processorRef: "x" }],
      bankTransactions: [
        { id: "b1", amountKurus: 125_000, transactionAt: new Date("2026-03-02"), matchedPaymentId: null },
      ],
    });
    expect(issues).toHaveLength(0);
  });
});

describe("devre kesici ve failover (SPEC 3.10 / 22)", () => {
  it("eşik aşılınca devre açılır", () => {
    const breaker = new CircuitBreaker("test", 2, 60_000);
    expect(breaker.canAttempt()).toBe(true);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.state).toBe("open");
    expect(breaker.canAttempt()).toBe(false);
  });

  it("başarı sonrası devre kapanır", () => {
    const breaker = new CircuitBreaker("test", 1);
    breaker.recordFailure();
    breaker.recordSuccess();
    expect(breaker.state).toBe("closed");
  });

  it("ilk sağlayıcı düşerse ikinciye geçer", async () => {
    const result = await failover(
      ["a", "b"],
      async (p) => {
        if (p === "a") throw new Error("down");
        return `ok:${p}`;
      },
    );
    expect(result.result).toBe("ok:b");
    expect(result.provider).toBe("b");
    expect(result.attempts).toBe(2);
  });

  it("tüm sağlayıcılar düşerse hata fırlatır", async () => {
    await expect(
      failover(["a", "b"], async () => {
        throw new Error("hepsi kapalı");
      }),
    ).rejects.toThrow("hepsi kapalı");
  });
});

describe("şeffaf komisyon (SPEC 1.2)", () => {
  it("komisyon borcun üstüne eklenir ve ayrı gösterilir", () => {
    const fees = calculateFees({
      amountKurus: 125_000,
      rates: { processorPct: 3.49, processorFixedKurus: 35, platformPct: 1 },
    });
    expect(fees.totalKurus).toBeGreaterThan(125_000);
    expect(fees.platformFeeKurus).toBe(1_250);
    // Borç tutarı kırılımda olduğu gibi duruyor: siteye geçecek olan bu.
    expect(fees.amountKurus).toBe(125_000);
  });

  it("makbuz HTML'i komisyon bilgisini içerir", () => {
    const html = receiptHtml({
      receiptNo: formatReceiptNo(2026, 123),
      tenantName: "Örnek Apartmanı",
      unitLabel: "12",
      payerName: "Ayşe Yılmaz",
      paidAt: new Date("2026-03-05"),
      amountKurus: 125_000,
      platformFeeKurus: 0,
      processorFeeKurus: 4_711,
      method: "Kredi kartı",
      items: [{ description: "Mart 2026 aidat", period: "2026-03", amountKurus: 125_000 }],
    });
    expect(html).toContain("MKB-2026-000123");
    expect(html).toContain("Şeffaf ücret gösterimi");
    expect(html).toContain("Örnek Apartmanı");
  });

  it("sağlayıcı yapılandırılmadığında manuel moda düşer", () => {
    expect(selectPaymentProvider()).toBe("manual");
  });
});

describe("tahsilat şansı skoru (SPEC 3.5)", () => {
  it("düzenli ödeyen malikte yüksek skor verir", () => {
    const r = collectionScore({
      isOwner: true,
      paymentsLast24Months: 22,
      accrualsLast24Months: 24,
      outstandingKurus: 250_000,
      monthlyDuesKurus: 125_000,
      oldestOverdueDays: 95,
      contactReachable: true,
      keptPromise: true,
      occupied: true,
      hadPreviousLegalCase: false,
    });
    expect(r.band).toBe("yuksek");
    expect(r.recommendationKey).toBe("yuksek");
    expect(r.factors.some((f) => f.code === "debtorIsOwner")).toBe(true);
  });

  it("ulaşılamayan kiracıda düşük skor ve icra önerir", () => {
    const r = collectionScore({
      isOwner: false,
      paymentsLast24Months: 2,
      accrualsLast24Months: 24,
      outstandingKurus: 2_000_000,
      monthlyDuesKurus: 125_000,
      oldestOverdueDays: 500,
      contactReachable: false,
      keptPromise: false,
      occupied: false,
      hadPreviousLegalCase: true,
    });
    expect(r.band).toBe("dusuk");
    expect(r.recommendationKey).toBe("dusuk");
    expect(r.factors.some((f) => f.code === "contactUnreachable")).toBe(true);
  });

  it("skor 0-100 aralığında kalır", () => {
    const r = collectionScore({
      isOwner: true,
      paymentsLast24Months: 24,
      accrualsLast24Months: 24,
      outstandingKurus: 1,
      monthlyDuesKurus: 125_000,
      oldestOverdueDays: 1,
      contactReachable: true,
      keptPromise: true,
      occupied: true,
      hadPreviousLegalCase: false,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
