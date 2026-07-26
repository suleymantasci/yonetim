import { describe, expect, it } from "vitest";

import { tlToKurus } from "@yonetim/core";
import {
  detectIntent, handleMessage, normalize, renderTemplate, serviceWindowEnd, WHATSAPP_TEMPLATES,
  type BotSession, type ResidentContext,
} from "@yonetim/whatsapp";
import { LOCALES } from "@yonetim/i18n";

import { botDeps } from "./helpers/i18n";

describe("niyet tespiti — AI'sız (SPEC 3.2)", () => {
  const cases: [string, string][] = [
    ["borc", "aidat_sorgu"],
    ["borcum ne kadar", "aidat_sorgu"],
    ["Ne kadar borcum var?", "aidat_sorgu"],
    ["aidat borcumu öğrenmek istiyorum", "aidat_sorgu"],
    ["odeme", "odeme_talebi"],
    ["nasıl ödeyebilirim", "odeme_talebi"],
    ["dün havale yaptım", "odeme_bildirimi"],
    ["asansör bozuldu", "talep_ariza"],
    ["su akmıyor 3 gündür", "talep_ariza"],
    ["doğalgaz faturası 450 tl geldi ne yapayım", "talep_ariza"],
    ["duyuru", "duyuru_sorgu"],
    ["son duyurular neler", "duyuru_sorgu"],
    ["yönetici numarası nedir", "yonetici_iletisim"],
    ["banka için borcu yoktur belgesi istiyorum", "borcu_yoktur_belgesi"],
    ["toplantı ne zaman", "toplanti_sorgu"],
    ["salon kiralamak istiyorum", "rezervasyon"],
    ["verilerimi silin", "kvkk_talebi"],
    ["IPTAL", "iptal_optout"],
    ["merhaba", "selamlama"],
    ["teşekkürler", "tesekkur"],
    ["yardim", "yardim"],
  ];

  for (const [text, expected] of cases) {
    it(`"${text}" → ${expected}`, () => {
      const r = detectIntent(text);
      expect(r.intent).toBe(expected);
      expect(r.confidence).toBeGreaterThan(0.4);
    });
  }

  it("yüksek doğrulukla niyet tespit oranı %90'ın üzerinde", () => {
    const correct = cases.filter(([text, expected]) => detectIntent(text).intent === expected).length;
    expect(correct / cases.length).toBeGreaterThanOrEqual(0.9);
  });

  it("anlamsız mesajda bilinmiyor döner", () => {
    expect(detectIntent("asdkjhqwe zxcv").intent).toBe("bilinmiyor");
  });

  it("Türkçe karakter olmadan yazımı tolere eder", () => {
    expect(detectIntent("odeme yapmak istiyorum").intent).toBe("odeme_talebi");
    expect(normalize("Şükrü Çağrı İğdır")).toBe("sukru cagri igdir");
  });

  it("slot çıkarımı yapar (tutar, daire, kategori)", () => {
    const r = detectIntent("daire 12 için 1500 TL ödeme yaptım, asansör de bozuk");
    expect(r.slots.unit).toBe("12");
    expect(r.slots.amount).toBe("1500");
    expect(r.slots.category).toBe("asansor");
  });
});

describe("bot durum makinesi (SPEC 3.1)", () => {
  // Gerçek Türkçe mesaj dosyasıyla çalışır; eksik anahtar testi düşürür.
  const deps = botDeps("tr");

  const identified: ResidentContext = {
    identified: true,
    userId: "u1",
    tenantId: "t1",
    tenantName: "Örnek Apartmanı",
    unitLabel: "12",
    displayName: "Ayşe Hanım",
    totalDebtKurus: tlToKurus(1_250),
    overdueDebtKurus: 0,
    nextDueDate: new Date("2026-03-10"),
    debtBreakdown: [
      { label: "Mart 2026 aidat", amountKurus: tlToKurus(1_250), dueDate: new Date("2026-03-10"), overdue: false },
    ],
    recentAnnouncements: [{ title: "Su kesintisi", publishedAt: new Date("2026-03-01") }],
  };

  const idle: BotSession = { state: "idle", slots: {} };

  it("kayıtsız numaradan daire numarası ister", () => {
    const r = handleMessage({ ...deps, text: "borc", session: idle, ctx: { identified: false } });
    expect(r.session.state).toBe("awaiting_identification");
    expect(r.text).toContain("daire numaranızı");
  });

  it("borç sorgusuna tutar ve vade ile yanıt verir", () => {
    const r = handleMessage({ ...deps, text: "borc", session: idle, ctx: identified });
    expect(r.text).toContain("1.250,00");
    expect(r.buttons?.length).toBeGreaterThan(0);
  });

  it("borcu olmayana teşekkür eder ve belge önerir", () => {
    const r = handleMessage({
      ...deps,
      text: "borcum ne kadar",
      session: idle,
      ctx: { ...identified, totalDebtKurus: 0, debtBreakdown: [] },
    });
    expect(r.text).toContain("borcunuz bulunmuyor");
  });

  it("ödeme talebinde ödeme aksiyonu üretir", () => {
    const r = handleMessage({ ...deps, text: "odeme", session: idle, ctx: identified });
    expect(r.action.type).toBe("send_payment_link");
  });

  it("arıza akışını kategori → açıklama → onay olarak yürütür", () => {
    const step1 = handleMessage({ ...deps, text: "talep", session: idle, ctx: identified });
    expect(step1.session.state).toBe("request_category");

    const step2 = handleMessage({ ...deps, text: "asansor", session: step1.session, ctx: identified });
    expect(step2.session.state).toBe("request_description");

    const step3 = handleMessage({
      ...deps,
      text: "Asansör 3. katta takılı kaldı",
      session: step2.session,
      ctx: identified,
    });
    expect(step3.session.state).toBe("request_confirm");

    const step4 = handleMessage({ ...deps, text: "evet", session: step3.session, ctx: identified });
    expect(step4.action.type).toBe("create_request");
    expect(step4.session.state).toBe("menu");
  });

  it("kategori mesajda geçiyorsa doğrudan onaya geçer", () => {
    const r = handleMessage({ ...deps, text: "asansör bozuldu", session: idle, ctx: identified });
    expect(r.session.state).toBe("request_confirm");
  });

  it("IPTAL akışı onay ister ve opt_out üretir", () => {
    const step1 = handleMessage({ ...deps, text: "iptal", session: idle, ctx: identified });
    expect(step1.session.state).toBe("opt_out_confirm");
    const step2 = handleMessage({ ...deps, text: "evet", session: step1.session, ctx: identified });
    expect(step2.action.type).toBe("opt_out");
  });

  it("belge talebinde onay sorar", () => {
    const r = handleMessage({
      ...deps,
      text: "borcu yoktur belgesi istiyorum",
      session: idle,
      ctx: identified,
    });
    expect(r.session.state).toBe("certificate_confirm");
    const confirmed = handleMessage({ ...deps, text: "evet", session: r.session, ctx: identified });
    expect(confirmed.action.type).toBe("request_certificate");
  });

  it("anlaşılmayan mesajı yöneticiye devreder", () => {
    const r = handleMessage({ ...deps, text: "qwerty zxcvbn", session: idle, ctx: identified });
    expect(r.needsHuman).toBe(true);
    expect(r.action.type).toBe("handoff_to_manager");
  });

  it("service window 24 saat olarak hesaplanır", () => {
    const at = new Date("2026-03-10T10:00:00Z");
    expect(serviceWindowEnd(at).getTime() - at.getTime()).toBe(24 * 3_600_000);
  });
});

describe("WhatsApp şablonları (SPEC 8.2 / 8.3)", () => {
  it("pazarlama kategorisinde şablon yoktur (maliyet kuralı)", () => {
    expect(WHATSAPP_TEMPLATES.every((t) => t.category !== "marketing")).toBe(true);
  });

  it("şablon parametreleri doldurulur", () => {
    const text = renderTemplate("aidat_hatirlatma", [
      "Örnek Apartmanı", "Mart 2026", "1.250,00 ₺", "10.03.2026",
    ]);
    expect(text).toContain("Örnek Apartmanı");
    expect(text).toContain("1.250,00 ₺");
    expect(text).not.toContain("{{");
  });

  it("her şablonun örnek değer sayısı parametre sayısına eşittir", () => {
    for (const t of WHATSAPP_TEMPLATES) {
      expect(t.examples.length, t.name).toBe(t.params.length);
    }
  });
});

describe("bot her dilde çalışır (SPEC 4.2)", () => {
  const ctx: ResidentContext = {
    identified: true,
    tenantName: "Örnek Apartmanı",
    unitLabel: "12",
    displayName: "Ayşe",
    totalDebtKurus: tlToKurus(1_250),
    overdueDebtKurus: 0,
    nextDueDate: new Date("2026-03-10"),
    debtBreakdown: [],
    recentAnnouncements: [],
  };
  const idle: BotSession = { state: "idle", slots: {} };

  for (const locale of LOCALES) {
    it(`${locale}: borç yanıtı o dilde ve tutar biçimli üretilir`, () => {
      const deps = botDeps(locale);
      const r = handleMessage({ ...deps, text: "borc", session: idle, ctx });

      // Metin boş olmamalı ve çevrilmemiş anahtar kalmamalı.
      expect(r.text.length).toBeGreaterThan(10);
      expect(r.text).not.toMatch(/\{[a-zA-Z]+\}/);
      expect(r.buttons).toHaveLength(3);
      expect(r.buttons?.every((b) => b.title.length > 0)).toBe(true);
    });

    it(`${locale}: menü seçenekleri o dilde listelenir`, () => {
      const deps = botDeps(locale);
      const r = handleMessage({ ...deps, text: "yardim", session: idle, ctx });
      expect(r.listItems?.length).toBe(6);
      expect(r.listItems?.every((i) => i.title.length > 0 && i.description!.length > 0)).toBe(true);
    });

    it(`${locale}: arıza kategorileri o dilde gelir`, () => {
      const deps = botDeps(locale);
      const r = handleMessage({ ...deps, text: "talep", session: idle, ctx });
      expect(r.listItems?.length).toBe(9);
      expect(r.listItems?.every((i) => i.title.length > 0)).toBe(true);
    });
  }

  it("iki dilde üretilen metinler birbirinden farklıdır", () => {
    const tr = handleMessage({ ...botDeps("tr"), text: "borc", session: idle, ctx });
    const en = handleMessage({ ...botDeps("en"), text: "borc", session: idle, ctx });
    expect(tr.text).not.toBe(en.text);
    expect(tr.buttons?.[0]?.title).not.toBe(en.buttons?.[0]?.title);
  });
});
