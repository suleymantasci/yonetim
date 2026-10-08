import * as XLSX from "xlsx";

/**
 * Test dökümleri — Türkiye'deki bankaların internet şubesi "hesap hareketleri"
 * dosyalarının **yapısını** taklit eder (künye satırları, başlık satırının
 * yeri, sütun adları/sırası, dosya biçimi, tutar gösterimi). Yapı bilgisi
 * gerçek dosyalarla çalışan açık kaynak ayrıştırıcıların ölçümlerinden:
 *
 *   - Ziraat: xlsx, styles.xml bozuk; başlık 12. satır; Tarih · Fiş No ·
 *     Açıklama · İşlem Tutarı (işaretli) · Bakiye
 *   - İş Bankası: eski xls (OLE2); başlık 16. satır; Tarih/Saat
 *     ("26/08/2026-14:58:47") · Valör · Kanal/Şube · İşlem Tutarı · Bakiye ·
 *     İşlem · İşlem Tipi · Açıklama · … · Referans (15. sütun)
 *   - Garanti BBVA: eski xls; başlık ~14. satır; Tarih · Açıklama · Etiket ·
 *     Tutar · Bakiye · Dekont No · Terminal No · Kart Tipi · Komisyon
 *   - Akbank: xlsx; başlık 10. satır; Tarih · Saat · Tutar (işaretli) ·
 *     Bakiye · Borç/Alacak (B/A) · Açıklama · Fiş/Dekont No
 *   - Vakıfbank: xlsx; başlık 7. satır; 17 sütun, TUTAR işaretsiz + B/A
 *   - Halkbank: xlsx; başlık ~23. satır; İşlem Tarihi · Hesaba Giriş Tarihi ·
 *     Açıklama · Borç · Alacak · Bakiye
 *   - TEB: TARİH · VALÖR · SAAT · AÇIKLAMA · İŞLEM ÖZEL AÇIKLAMASI ·
 *     İŞLEM TİPİ · TUTAR · BAKİYE · DEKONT NO · ALICI
 *   - QNB: İşlem Tarihi · Kanal · İşlem Açıklaması · Tutar · Bakiye
 *     (İngilizce sayı biçimi: 1,250.00)
 *   - Enpara: xls; Tarih · Hareket tipi · Açıklama · İşlem Tutarı · Bakiye
 *   - Kuveyt Türk: .xlsx uzantılı HTML tablo; İŞLEM TARİHİ · AÇIKLAMA ·
 *     TUTAR · BAKİYE · Referans Kodu
 *
 * Her dökümde aynı üç hareket var (iki tahsilat, bir gider) + bir devir ve
 * bir toplam satırı — ayrıştırıcının hepsinde aynı sonucu vermesi beklenir.
 * Yalnız testler ve örnek dosya üretimi kullanır; uygulama kodu içe almaz.
 */

export interface FixtureExpectation {
  /** 0 tabanlı başlık satırı. */
  headerRow: number;
  rows: Array<{ date: string; direction: "in" | "out"; amountKurus: number; descriptionIncludes: string; reference?: string }>;
}

export interface BankFixture {
  bank: string;
  fileName: string;
  build: () => Uint8Array;
  expect: FixtureExpectation;
}

const HOLDER = "YEŞİLVADİ SİTESİ YÖNETİMİ";
const IBAN = "TR33 0006 1005 1978 6457 8413 26";

/** Ortak üç hareket. */
const TX = [
  { d: [5, 10, 2026], t: "09:14", amount: 1250, desc: "FAST GELEN AYŞE YILMAZ A BLOK D:12 EKİM AİDAT", ref: "F08179" },
  { d: [6, 10, 2026], t: "14:58", amount: 2500.5, desc: "EFT MEHMET KAYA DAİRE 7 AİDAT", ref: "F08190" },
  { d: [7, 10, 2026], t: "11:02", amount: -3400.75, desc: "ASANSÖR BAKIM A.Ş. FATURA ÖDEMESİ", ref: "F08203" },
] as const;

/** Garanti'nin birleşik açıklaması (gönderen-hesap-not-kanal-sorgu). */
const GARANTI_DESC = [
  "AYŞE YILMAZ-999/1234567-A BLOK D:12 EKİM AİDAT-FAST-5008524",
  "MEHMET KAYA--HVL-CEP ŞUBE",
  "ASANSÖR BAKIM A.Ş.-FAT2026100710273",
];

const expectRows = (refs = true): FixtureExpectation["rows"] =>
  TX.map((t) => ({
    date: `2026-10-0${t.d[0]}`,
    direction: t.amount > 0 ? "in" : "out",
    amountKurus: Math.round(Math.abs(t.amount) * 100),
    descriptionIncludes: t.desc.split(" ").slice(0, 2).join(" "),
    ...(refs ? { reference: t.ref } : {}),
  }));

const p2 = (n: number) => String(n).padStart(2, "0");
const trDate = (d: readonly number[], sep = ".") => `${p2(d[0]!)}${sep}${p2(d[1]!)}${sep}${d[2]}`;
const trMoney = (n: number) =>
  `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const enMoney = (n: number) =>
  `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Excel tarih hücresi (yerel öğlen: SheetJS yerel bileşenlerle okur). */
const xlDate = (d: readonly number[], time?: string) => {
  const [h, m] = (time ?? "00:00").split(":").map(Number);
  return new Date(d[2]!, d[1]! - 1, d[0]!, h, m);
};

function sheetFile(aoa: unknown[][], bookType: "xlsx" | "biff8"): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "Hesap Hareketleri");
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType, cellDates: true }) as Buffer);
}

/** Künye: bankanın adı, hesap sahibi, IBAN, dönem — başlıktan önceki satırlar. */
function preamble(bank: string, headerRow: number): unknown[][] {
  const rows: unknown[][] = [
    [bank],
    [],
    ["Hesap Sahibi", HOLDER],
    ["IBAN", IBAN],
    ["Döviz Cinsi", "TL"],
    ["Tarih Aralığı", "01.10.2026 - 08.10.2026"],
  ];
  while (rows.length < headerRow) rows.push([]);
  return rows.slice(0, headerRow);
}

let running = 50_000;
const balanceAfter = (amount: number) => (running = Math.round((running + amount) * 100) / 100);

export const BANK_FIXTURES: BankFixture[] = [
  {
    bank: "Ziraat Bankası",
    fileName: "ziraat-hesap-hareketleri.xlsx",
    expect: { headerRow: 11, rows: expectRows() },
    build: () => {
      running = 50_000;
      const aoa = [
        ...preamble("T.C. ZİRAAT BANKASI A.Ş.", 11),
        ["Tarih", "Fiş No", "Açıklama", "İşlem Tutarı", "Bakiye"],
        ...TX.map((t) => [trDate(t.d), t.ref, t.desc, t.amount, balanceAfter(t.amount)]),
        [null, null, "Toplam", 349.75, null],
      ];
      return breakStyles(sheetFile(aoa, "xlsx"));
    },
  },
  {
    bank: "Türkiye İş Bankası",
    fileName: "isbank-hesap-hareketleri.xls",
    expect: { headerRow: 15, rows: expectRows() },
    build: () => {
      running = 50_000;
      const header = ["Tarih/Saat", "Valör", "Kanal/Şube", "İşlem Tutarı", "Bakiye", null, "İşlem", "İşlem Tipi", "Açıklama", null, null, null, null, null, "Referans"];
      const aoa = [
        ...preamble("TÜRKİYE İŞ BANKASI A.Ş.", 15),
        header,
        ...TX.map((t) => [
          `${trDate(t.d, "/")}-${t.t}:47`, trDate(t.d, "/"), "İşCep", t.amount, balanceAfter(t.amount), null,
          t.amount > 0 ? "E9" : "EF", t.amount > 0 ? "FAST" : "EFT", t.desc, null, null, null, null, null, t.ref,
        ]),
      ];
      return sheetFile(aoa, "biff8");
    },
  },
  {
    bank: "Garanti BBVA",
    fileName: "garanti-hesap-hareketleri.xls",
    // Gerçek dosyadan (2026-10): 14 künye satırı, 6 sütun, tarih "gg/aa/yyyy"
    // metin, tutar/bakiye sayı, Dekont No zaman damgası. Gelen havalede
    // gönderen + hesap + gönderenin notu tek hücrede: "AD-HESAP-NOT-FAST-SORGU".
    expect: {
      headerRow: 14,
      rows: expectRows().map((r, i) => ({ ...r, descriptionIncludes: GARANTI_DESC[i]!.slice(0, 12) })),
    },
    build: () => {
      running = 50_000;
      const aoa = [
        ...preamble("T. GARANTİ BANKASI A.Ş.", 14),
        ["Tarih", "Açıklama", "Etiket", "Tutar", "Bakiye", "Dekont No"],
        ...TX.map((t, i) => [trDate(t.d, "/"), GARANTI_DESC[i], t.amount > 0 ? "Para Transferi" : "Kurum Ödemesi", t.amount, balanceAfter(t.amount), t.ref]),
      ];
      return sheetFile(aoa, "biff8");
    },
  },
  {
    bank: "Akbank",
    fileName: "akbank-hesap-hareketleri.xlsx",
    expect: { headerRow: 9, rows: expectRows() },
    build: () => {
      running = 50_000;
      const aoa = [
        ...preamble("AKBANK T.A.Ş.", 9),
        ["Tarih", "Saat", "Tutar", "Bakiye", "Borç/Alacak", "Açıklama", "Fiş/Dekont No"],
        ...TX.map((t) => [xlDate(t.d), t.t, t.amount, balanceAfter(t.amount), t.amount > 0 ? "A" : "B", `7777/MBL-${t.desc}`, t.ref]),
      ];
      return sheetFile(aoa, "xlsx");
    },
  },
  {
    bank: "VakıfBank",
    fileName: "vakifbank-hesap-hareketleri.xlsx",
    expect: { headerRow: 6, rows: expectRows() },
    build: () => {
      running = 50_000;
      const header = ["HESAP NO", "FİŞ NO", "HAREKET TARIH", "İŞLEM TARİHİ", "KART NO", "İŞLEM", "TUTAR", "BAKİYE", "KANAL", "İŞLEM NO", "REFERANS", "HAVALE", "REF NO", "TCKN", "VKN", "B/A", "AÇIKLAMA"];
      const aoa = [
        ...preamble("TÜRKİYE VAKIFLAR BANKASI T.A.O.", 6),
        header,
        ...TX.map((t) => [
          "00158007298490100", t.ref, `${trDate(t.d)} ${t.t}`, trDate(t.d), null, t.amount > 0 ? "Gelen FAST" : "Giden EFT",
          Math.abs(t.amount), balanceAfter(t.amount), "İnternet", "2026100500123", null, null, null, null, null,
          t.amount > 0 ? "A" : "B", t.desc,
        ]),
      ];
      return sheetFile(aoa, "xlsx");
    },
  },
  {
    bank: "Halkbank",
    fileName: "halkbank-hesap-hareketleri.xlsx",
    expect: { headerRow: 22, rows: expectRows(false) },
    build: () => {
      running = 50_000;
      const aoa = [
        ...preamble("TÜRKİYE HALK BANKASI A.Ş.", 22),
        ["İşlem Tarihi", "Hesaba Giriş Tarihi", "Açıklama", "Borç", "Alacak", "Bakiye"],
        ...TX.map((t) => [xlDate(t.d), xlDate(t.d), t.desc, t.amount < 0 ? Math.abs(t.amount) : null, t.amount > 0 ? t.amount : null, balanceAfter(t.amount)]),
        [null, null, "Genel Toplam", 3400.75, 3750.5, null],
      ];
      return sheetFile(aoa, "xlsx");
    },
  },
  {
    bank: "TEB",
    fileName: "teb-hesap-hareketleri.xlsx",
    expect: { headerRow: 8, rows: expectRows() },
    build: () => {
      running = 50_000;
      const aoa = [
        ...preamble("TÜRK EKONOMİ BANKASI A.Ş.", 8),
        ["TARİH", "VALÖR", "SAAT", "AÇIKLAMA", "İŞLEM ÖZEL AÇIKLAMASI", "İŞLEM TİPİ", "TUTAR", "BAKİYE", "DEKONT NO", "ALICI"],
        ...TX.map((t) => [trDate(t.d), trDate(t.d), t.t, t.desc, null, t.amount > 0 ? "Gelen FAST" : "Giden EFT", trMoney(t.amount), trMoney(balanceAfter(t.amount)), t.ref, null]),
      ];
      return sheetFile(aoa, "xlsx");
    },
  },
  {
    bank: "QNB",
    fileName: "qnb-hesap-hareketleri.xlsx",
    expect: { headerRow: 7, rows: expectRows(false) },
    build: () => {
      running = 50_000;
      const aoa = [
        ...preamble("QNB BANK A.Ş.", 7),
        ["İşlem Tarihi", "Kanal", "İşlem Açıklaması", "Tutar", "Bakiye"],
        ...TX.map((t) => [trDate(t.d), "Mobil", t.desc, enMoney(t.amount), enMoney(balanceAfter(t.amount))]),
      ];
      return sheetFile(aoa, "xlsx");
    },
  },
  {
    bank: "Enpara",
    fileName: "enpara-hesap-hareketleriniz.xls",
    expect: { headerRow: 4, rows: expectRows(false) },
    build: () => {
      running = 50_000;
      const aoa = [
        ...preamble("Enpara.com", 4),
        ["Tarih", "Hareket tipi", "Açıklama", "İşlem Tutarı", "Bakiye"],
        ...TX.map((t) => [trDate(t.d), t.amount > 0 ? "Gelen Para" : "Giden Para", t.desc, `${trMoney(t.amount)} TL`, `${trMoney(balanceAfter(t.amount))} TL`]),
      ];
      return sheetFile(aoa, "biff8");
    },
  },
  {
    bank: "Kuveyt Türk",
    fileName: "kuveytturk-hesap-hareketleri.xlsx",
    expect: { headerRow: 3, rows: expectRows() },
    build: () => {
      running = 50_000;
      const cells = (r: unknown[], tag = "td") => `<tr>${r.map((c) => `<${tag}>${c ?? ""}</${tag}>`).join("")}</tr>`;
      const html = [
        "<html><head><meta charset=\"utf-8\"></head><body><table>",
        cells(["KUVEYT TÜRK KATILIM BANKASI A.Ş."]),
        cells(["Hesap Sahibi", HOLDER]),
        cells(["IBAN", IBAN]),
        cells(["İŞLEM TARİHİ", "AÇIKLAMA", "TUTAR", "BAKİYE", "Referans Kodu"], "th"),
        ...TX.map((t) => cells([trDate(t.d), t.desc, trMoney(t.amount), trMoney(balanceAfter(t.amount)), t.ref])),
        "</table></body></html>",
      ].join("");
      return new TextEncoder().encode(html);
    },
  },
  {
    bank: "CSV (Windows-1254, ayrı borç/alacak)",
    fileName: "hesap-hareketleri.csv",
    expect: { headerRow: 2, rows: expectRows(false) },
    build: () => {
      running = 50_000;
      const lines = [
        `Hesap Sahibi;${HOLDER}`,
        `IBAN;${IBAN}`,
        "Tarih;Açıklama;Borç;Alacak;Bakiye",
        ...TX.map((t) => [trDate(t.d), `"${t.desc}"`, t.amount < 0 ? trMoney(-t.amount) : "", t.amount > 0 ? trMoney(t.amount) : "", trMoney(balanceAfter(t.amount))].join(";")),
        ";Toplam;3.400,75;3.750,50;",
      ];
      return encode1254(lines.join("\r\n"));
    },
  },
];

/**
 * Ziraat'in gerçek dosyasındaki gibi `styles.xml` geçersiz: `<fill>` yerine
 * tanımsız bir öğe. Katı okuyucular (openpyxl, ClosedXML) burada düşüyor.
 */
function breakStyles(xlsx: Uint8Array): Uint8Array {
  const cfb = XLSX.CFB.read(xlsx, { type: "buffer" });
  // CFB yolu kökten: "/xl/styles.xml" (göreli ad bulunmuyor).
  const entry = XLSX.CFB.find(cfb, "/xl/styles.xml");
  if (!entry?.content) throw new Error("fixture: styles.xml yok");
  const xml = Buffer.from(entry.content as Uint8Array).toString("utf8");
  const broken = xml.replace(/<fills[^>]*>[\s\S]*?<\/fills>/, '<fills count="2"><fill><bozuk/></fill><fill/></fills>');
  entry.content = Buffer.from(broken, "utf8");
  return new Uint8Array(XLSX.CFB.write(cfb, { type: "buffer", fileType: "zip" }) as Buffer);
}

/** Türkçe karakterleri Windows-1254'e kodla (eski internet şubesi CSV'si). */
function encode1254(text: string): Uint8Array {
  const map: Record<string, number> = { "Ğ": 0xd0, "ğ": 0xf0, "İ": 0xdd, "ı": 0xfd, "Ş": 0xde, "ş": 0xfe, "Ç": 0xc7, "ç": 0xe7, "Ö": 0xd6, "ö": 0xf6, "Ü": 0xdc, "ü": 0xfc };
  return Uint8Array.from([...text].map((ch) => map[ch] ?? (ch.charCodeAt(0) < 128 ? ch.charCodeAt(0) : 0x3f)));
}
