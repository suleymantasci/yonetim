import * as XLSX from "xlsx";

/**
 * Banka dökümünü biçimden bağımsız bir tabloya çevirir: `Cell[][]`.
 *
 * Türkiye'deki bankaların dışa aktarımları dört kılıkta geliyor (ölçülmüş
 * gerçek dosyalardan, bkz. `statement-map.ts` başlığı):
 *
 *   - gerçek `.xlsx` (Akbank, Vakıfbank, Halkbank, TEB) — Ziraat'inkinin
 *     `styles.xml`'i bozuk, katı okuyucular açamıyor
 *   - eski `.xls` (OLE2/BIFF8) — İş Bankası, Garanti
 *   - `.xlsx` uzantılı **HTML tablosu** — Kuveyt Türk
 *   - CSV/TXT — `;`, `,` ya da sekme ayraçlı; UTF-8 ya da Windows-1254
 *
 * Biçim uzantıdan değil **imzadan** seçiliyor (`PK` zip, `D0 CF 11 E0` OLE2,
 * `<` HTML); uzantı yalan söyleyebiliyor. Okuyucu SheetJS (xlsx/xls/html);
 * düz metin kendi ayırıcımızla, çünkü ayraç ve kodlama tahminini kontrol
 * etmek istiyoruz.
 *
 * Hücre ham değeriyle döner: sayı sayı, tarih `Date`, metin metin. Biçimli
 * metne çevirmek ("1.250,00") Excel'in sayı biçimine ve sunucu yereline
 * bağımlı olurdu; tutarı sayıdan okumak kesin.
 */
export type Cell = string | number | Date | null;

export type TableFormat = "xlsx" | "xls" | "html" | "csv";

export interface Table {
  format: TableFormat;
  rows: Cell[][];
}

/** Ekstre dosyası için üst sınır (bayt). */
export const MAX_STATEMENT_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 20_000;

export class StatementFileError extends Error {
  constructor(readonly code: "empty" | "too_large" | "unreadable") {
    super(code);
  }
}

export function sniffFormat(buf: Uint8Array): TableFormat {
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "xlsx";
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "xls";
  const head = decodeText(buf.subarray(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<")) return "html";
  return "csv";
}

export function readTable(buf: Uint8Array): Table {
  if (buf.byteLength === 0) throw new StatementFileError("empty");
  if (buf.byteLength > MAX_STATEMENT_BYTES) throw new StatementFileError("too_large");

  const format = sniffFormat(buf);
  if (format === "csv") return { format, rows: parseDelimited(decodeText(buf)) };

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, {
      type: "buffer",
      cellDates: true,
      // Stil/biçim gövdesine gerek yok; Ziraat'in bozuk styles.xml'i de bu
      // yüzden okumayı düşürmüyor (sayı biçimleri ayrı tutuluyor).
      cellStyles: false,
      cellHTML: false,
      sheetRows: MAX_ROWS,
      dense: true,
      // HTML tablosunda (Kuveyt Türk) metni sayıya **çevirme**: SheetJS
      // "1.250,00"ı ABD kuralıyla 1,25 okuyordu. Tutarı Türkçe kuralla
      // `parseAmount` okuyor.
      raw: format === "html",
    });
  } catch {
    throw new StatementFileError("unreadable");
  }
  // Hareketler her zaman ilk dolu sayfada; künye sayfası olan banka görmedik.
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      // Boş satırlar korunuyor: satır numarası dosyadakiyle aynı kalsın
      // (hata mesajı "12. satır" dediğinde kullanıcı Excel'de o satırı bulur).
      blankrows: true,
    });
    if (rows.some((r) => r.some((c) => c !== null && c !== ""))) return { format, rows: rows.map(normalizeRow) };
  }
  throw new StatementFileError("unreadable");
}

function normalizeRow(row: unknown[]): Cell[] {
  return row.map((cell) => {
    if (cell === null || cell === undefined) return null;
    if (cell instanceof Date || typeof cell === "number") return cell;
    if (typeof cell === "boolean") return cell ? "1" : "0";
    const text = String(cell).replace(/\u00a0/g, " ").trim();
    return text === "" ? null : text;
  });
}

/**
 * UTF-8 geçerliyse UTF-8; değilse Windows-1254 (Türkçe Windows — eski
 * internet şubelerinin CSV'si). BOM atılır.
 */
export function decodeText(buf: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("windows-1254").decode(buf);
  }
  return text.replace(/^\uFEFF/, "");
}

/** Ayraç: başlık adayı satırlarda en çok geçen (`;` > sekme > `,` eşitlikte). */
function parseDelimited(text: string): Cell[][] {
  const lines = text.split(/\r?\n/).slice(0, MAX_ROWS);
  const sample = lines.slice(0, 40).join("\n");
  const delimiter = [";", "\t", ","]
    .map((d) => [d, sample.split(d).length - 1] as const)
    .sort((a, b) => b[1] - a[1])[0]![0];
  // Boş satırlar korunuyor (satır numaraları dosyayla aynı); sondaki boşluk atılır.
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") lines.pop();
  return lines.map((line) => splitLine(line, delimiter).map((c) => (c.trim() === "" ? null : c.trim())));
}

/** Tırnaklı alanları (`"a;b"`) bölmeden tutan ayırıcı. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out;
}
