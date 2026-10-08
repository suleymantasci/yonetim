import { readFileSync } from "node:fs";
import path from "node:path";

import PDFDocument from "pdfkit";

/**
 * Rapor PDF'i — tarayıcının "Yazdır"ı yerine sunucuda üretilen belge.
 *
 * Tarayıcı çıktısı ekran düzenini basıyordu: kenar menü, üst bar, yatay
 * kaydırmalı tablolar (kesiliyor) ve uzun listelerde onlarca sayfa. Burada
 * her rapor kendi içeriğini blok listesi olarak tarif ediyor; sayfa düzeni,
 * tablo başlığının her sayfada tekrarı ve "Sayfa x / y" altlığı tek yerde.
 *
 * Font gömülü (Noto Sans, OFL): PDF'in standart Helvetica'sında `₺`, `ı`, `ş`,
 * `ğ` yok. Dosyalar `apps/app/assets/fonts` altında; uygulama `apps/app`
 * dizininden başlatılıyor (Dockerfile.app, `next start`).
 */

export type Align = "left" | "right" | "center";

export interface TableColumn {
  header: string;
  /** Göreli genişlik (flex ağırlığı). Varsayılan 1. */
  weight?: number;
  align?: Align;
  /** Metin sütunu: sığmazsa alt satıra kayar. Sayı sütunları kaymaz, font küçülür. */
  wrap?: boolean;
}

export interface TableRow {
  cells: string[];
  /** Hücre altına küçük gri ikinci satır (ör. hesap adı, malik). */
  notes?: (string | undefined)[];
  kind?: "section" | "total" | "grand" | "sub" | "muted";
  /** Kırmızı basılacak hücre indeksleri (negatif bakiye). */
  negative?: number[];
}

export type Block =
  | { type: "docTitle"; title: string; subtitle?: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string; muted?: boolean }
  | { type: "stats"; items: { label: string; value: string }[] }
  | {
      type: "table";
      columns: TableColumn[];
      rows: TableRow[];
      /** Başlık satırı gizli (anahtar-değer tablosu). */
      headless?: boolean;
    }
  | { type: "checklist"; items: string[] }
  /** Serbest metin: doluysa metin, boşsa elle doldurmak için çizgili satırlar. */
  | { type: "note"; text?: string; lines: number }
  | { type: "signatures"; labels: string[]; caption: string }
  | { type: "alert"; text: string }
  | { type: "pageBreak" };

export interface ReportPdf {
  /** Her sayfanın üst satırı: site adı · rapor adı. */
  tenantName: string;
  title: string;
  /** Üst satırın sağı: dönem / tarih. */
  period: string;
  landscape?: boolean;
  blocks: Block[];
  labels: { page: (page: number, total: number) => string; generated: string };
}

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
let fonts: { regular: Buffer; bold: Buffer } | undefined;
function loadFonts() {
  fonts ??= {
    regular: readFileSync(path.join(FONT_DIR, "NotoSans-Regular.ttf")),
    bold: readFileSync(path.join(FONT_DIR, "NotoSans-Bold.ttf")),
  };
  return fonts;
}

const C = {
  fg: "#111827",
  muted: "#4b5563",
  subtle: "#6b7280",
  rule: "#d1d5db",
  strong: "#374151",
  fill: "#f3f4f6",
  danger: "#b91c1c",
  warnFill: "#fef2f2",
};

const MARGIN = 36;
const HEADER_H = 22;
const FOOTER_H = 20;
const PAD_X = 4;
const PAD_Y = 3;

export async function renderReportPdf(report: ReportPdf): Promise<Buffer> {
  const f = loadFonts();
  const doc = new PDFDocument({
    size: "A4",
    layout: report.landscape ? "landscape" : "portrait",
    margins: {
      top: MARGIN + HEADER_H,
      bottom: MARGIN + FOOTER_H,
      left: MARGIN,
      right: MARGIN,
    },
    bufferPages: true,
    font: f.regular as unknown as string,
    info: {
      Title: `${report.title} — ${report.tenantName}`,
      Creator: "Site yönetim paneli",
    },
  });
  doc.registerFont("R", f.regular);
  doc.registerFont("B", f.bold);
  doc.font("R");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = MARGIN;
  const width = doc.page.width - 2 * MARGIN;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  for (const block of report.blocks) {
    switch (block.type) {
      case "docTitle": {
        ensure(50);
        doc.font("B").fontSize(14).fillColor(C.fg);
        doc.text(block.title, left, doc.y, { width, align: "center" });
        if (block.subtitle) {
          doc.font("R").fontSize(10).fillColor(C.muted);
          doc.text(block.subtitle, left, doc.y + 2, { width, align: "center" });
        }
        doc.moveDown(1);
        break;
      }
      case "heading": {
        ensure(40);
        doc.moveDown(0.6);
        doc.font("B").fontSize(10.5).fillColor(C.fg);
        doc.text(block.text, left, doc.y, { width });
        doc.moveDown(0.3);
        break;
      }
      case "paragraph": {
        doc
          .font("R")
          .fontSize(block.muted ? 8 : 9.5)
          .fillColor(block.muted ? C.subtle : C.fg);
        ensure(doc.heightOfString(block.text, { width }));
        doc.text(block.text, left, doc.y, { width, lineGap: 2 });
        doc.moveDown(0.6);
        break;
      }
      case "alert": {
        doc.font("B").fontSize(9);
        const h = doc.heightOfString(block.text, { width: width - 16 }) + 10;
        ensure(h);
        const y = doc.y;
        doc.rect(left, y, width, h).fill(C.warnFill);
        doc
          .fillColor(C.danger)
          .text(block.text, left + 8, y + 5, { width: width - 16 });
        doc.y = y + h + 8;
        break;
      }
      case "stats": {
        const n = block.items.length;
        const gap = 8;
        const w = (width - gap * (n - 1)) / n;
        const h = 38;
        ensure(h + 10);
        const y = doc.y;
        block.items.forEach((item, i) => {
          const x = left + i * (w + gap);
          doc
            .roundedRect(x, y, w, h, 4)
            .lineWidth(0.6)
            .strokeColor(C.rule)
            .stroke();
          doc.font("R").fontSize(7.5).fillColor(C.subtle);
          doc.text(item.label, x + 8, y + 6, {
            width: w - 16,
            lineBreak: false,
            ellipsis: true,
          });
          doc.font("B").fontSize(11).fillColor(C.fg);
          doc.text(item.value, x + 8, y + 18, {
            width: w - 16,
            lineBreak: false,
            ellipsis: true,
          });
        });
        doc.x = left;
        doc.y = y + h + 12;
        break;
      }
      case "table":
        drawTable(doc, block, left, width, bottom);
        doc.moveDown(0.8);
        break;
      case "checklist": {
        doc.font("R").fontSize(9.5).fillColor(C.fg);
        for (const item of block.items) {
          const h = doc.heightOfString(item, { width: width - 18 }) + 4;
          ensure(h);
          const y = doc.y;
          doc
            .rect(left, y + 1.5, 9, 9)
            .lineWidth(0.7)
            .strokeColor(C.strong)
            .stroke();
          doc.fillColor(C.fg).text(item, left + 16, y, { width: width - 18 });
          doc.y = y + h;
        }
        doc.x = left;
        doc.moveDown(0.4);
        break;
      }
      case "note": {
        const text = block.text?.trim();
        if (text) {
          doc.font("R").fontSize(9.5).fillColor(C.fg);
          // Uzun metin kendiliğinden sayfa atlar; yalnız ilk satırın sığdığından emin ol.
          ensure(14);
          doc.text(text, left, doc.y, { width, lineGap: 2 });
          doc.moveDown(0.6);
        } else {
          const step = 18;
          ensure(step * block.lines);
          const y0 = doc.y;
          for (let i = 1; i <= block.lines; i++) {
            doc
              .moveTo(left, y0 + i * step)
              .lineTo(left + width, y0 + i * step)
              .lineWidth(0.5)
              .dash(1.5, { space: 2 })
              .strokeColor(C.rule)
              .stroke()
              .undash();
          }
          doc.y = y0 + block.lines * step + 8;
        }
        break;
      }
      case "signatures": {
        const n = block.labels.length;
        const gap = 24;
        const slot = n === 1 ? width / 2.5 : (width - gap * (n - 1)) / n;
        const h = 70;
        ensure(h);
        const y = doc.y + 40;
        block.labels.forEach((label, i) => {
          // Tek imza sağa yaslı (yönetici), çoklu imza eşit dağılır.
          const x = n === 1 ? left + width - slot : left + i * (slot + gap);
          doc
            .moveTo(x, y)
            .lineTo(x + slot, y)
            .lineWidth(0.7)
            .strokeColor(C.strong)
            .stroke();
          doc
            .font("B")
            .fontSize(9)
            .fillColor(C.fg)
            .text(label, x, y + 4, { width: slot, align: "center" });
          doc
            .font("R")
            .fontSize(7.5)
            .fillColor(C.subtle)
            .text(block.caption, x, doc.y, { width: slot, align: "center" });
        });
        doc.x = left;
        doc.y = y + 34;
        break;
      }
      case "pageBreak":
        doc.addPage();
        break;
    }
  }

  // Üst ve alt satır: sayfa sayısı ancak sonda belli.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    // Kenar boşluğuna yazarken otomatik sayfa eklenmesin.
    const margins = doc.page.margins;
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };

    doc.font("B").fontSize(8).fillColor(C.fg);
    doc.text(report.tenantName, MARGIN, MARGIN, {
      width: width * 0.6,
      lineBreak: false,
      ellipsis: true,
    });
    const tw = doc.widthOfString(report.tenantName);
    doc.font("R").fillColor(C.muted);
    doc.text(
      `  ·  ${report.title}`,
      MARGIN + Math.min(tw, width * 0.6),
      MARGIN,
      {
        width: width * 0.4,
        lineBreak: false,
        ellipsis: true,
      },
    );
    doc.text(report.period, MARGIN, MARGIN, {
      width,
      align: "right",
      lineBreak: false,
    });
    doc
      .moveTo(MARGIN, MARGIN + 13)
      .lineTo(pageW - MARGIN, MARGIN + 13)
      .lineWidth(0.6)
      .strokeColor(C.rule)
      .stroke();

    const fy = pageH - MARGIN - 8;
    doc.font("R").fontSize(7).fillColor(C.subtle);
    doc.text(report.labels.generated, MARGIN, fy, {
      width: width / 2,
      lineBreak: false,
    });
    doc.text(report.labels.page(i + 1, range.count), MARGIN, fy, {
      width,
      align: "right",
      lineBreak: false,
    });

    doc.page.margins = margins;
  }

  doc.end();
  return done;
}

function drawTable(
  doc: PDFKit.PDFDocument,
  block: Extract<Block, { type: "table" }>,
  left: number,
  width: number,
  bottom: () => number,
) {
  const cols = block.columns;
  const totalWeight = cols.reduce((s, c) => s + (c.weight ?? 1), 0);
  const widths = cols.map((c) => (width * (c.weight ?? 1)) / totalWeight);
  const xs = widths.map(
    (_, i) => left + widths.slice(0, i).reduce((s, w) => s + w, 0),
  );

  // Kaymayan (sayı) sütunlarda en uzun değer sığana dek fontu küçült: 12 aylık
  // gelir-gider tablosu yatay A4'e tek parça sığsın, kesilmesin.
  let size = 8.5;
  const fits = (s: number) =>
    cols.every((c, i) => {
      if (c.wrap) return true;
      doc.font("B").fontSize(s);
      const texts = [c.header, ...block.rows.map((r) => r.cells[i] ?? "")];
      return texts.every((t) => doc.widthOfString(t) <= widths[i]! - 2 * PAD_X);
    });
  while (size > 6 && !fits(size)) size -= 0.25;
  const noteSize = size - 1.5;

  const cellOpts = (i: number) => ({
    width: widths[i]! - 2 * PAD_X,
    align: cols[i]!.align ?? "left",
    lineBreak: cols[i]!.wrap ?? false,
  });

  const rowHeight = (row: TableRow) => {
    let h = 0;
    row.cells.forEach((text, i) => {
      if (row.kind === "section" && i > 0) return;
      doc
        .font(
          row.kind && row.kind !== "sub" && row.kind !== "muted" ? "B" : "R",
        )
        .fontSize(size);
      const w =
        row.kind === "section"
          ? width - 2 * PAD_X
          : widths[i]! - 2 * PAD_X - (row.kind === "sub" && i === 0 ? 10 : 0);
      let ch =
        cols[i]?.wrap || row.kind === "section"
          ? doc.heightOfString(text || " ", { width: w })
          : doc.currentLineHeight();
      const note = row.notes?.[i];
      if (note) {
        doc.font("R").fontSize(noteSize);
        ch += doc.heightOfString(note, { width: w });
      }
      h = Math.max(h, ch);
    });
    return h + 2 * PAD_Y;
  };

  const drawHeader = () => {
    if (block.headless) return;
    doc.font("B").fontSize(size - 0.5);
    const h =
      Math.max(
        ...cols.map((c, i) =>
          doc.heightOfString(c.header, { width: widths[i]! - 2 * PAD_X }),
        ),
      ) +
      2 * PAD_Y;
    const y = doc.y;
    cols.forEach((c, i) => {
      doc.fillColor(C.muted).text(c.header, xs[i]! + PAD_X, y + PAD_Y, {
        width: widths[i]! - 2 * PAD_X,
        align: c.align ?? "left",
      });
    });
    doc
      .moveTo(left, y + h)
      .lineTo(left + width, y + h)
      .lineWidth(0.8)
      .strokeColor(C.strong)
      .stroke();
    doc.y = y + h;
  };

  if (doc.y + 40 > bottom()) doc.addPage();
  drawHeader();

  block.rows.forEach((row, ri) => {
    const h = rowHeight(row);
    if (doc.y + h > bottom()) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    const bold =
      row.kind === "section" || row.kind === "total" || row.kind === "grand";

    if (row.kind === "section") doc.rect(left, y, width, h).fill(C.fill);
    if (row.kind === "grand") {
      doc
        .moveTo(left, y + 0.5)
        .lineTo(left + width, y + 0.5)
        .lineWidth(0.8)
        .strokeColor(C.strong)
        .stroke();
      doc
        .moveTo(left, y + 2.5)
        .lineTo(left + width, y + 2.5)
        .lineWidth(0.8)
        .strokeColor(C.strong)
        .stroke();
    } else if (row.kind === "total") {
      doc
        .moveTo(left, y)
        .lineTo(left + width, y)
        .lineWidth(0.7)
        .strokeColor(C.strong)
        .stroke();
    }

    if (row.kind === "section") {
      doc.font("B").fontSize(size).fillColor(C.fg);
      doc.text(row.cells[0] ?? "", left + PAD_X, y + PAD_Y, {
        width: width - 2 * PAD_X,
      });
    } else {
      row.cells.forEach((text, i) => {
        const indent = row.kind === "sub" && i === 0 ? 10 : 0;
        const color = row.negative?.includes(i)
          ? C.danger
          : row.kind === "sub" || row.kind === "muted"
            ? C.muted
            : C.fg;
        doc
          .font(bold ? "B" : "R")
          .fontSize(size)
          .fillColor(color);
        const opts = cellOpts(i);
        doc.text(
          text,
          xs[i]! + PAD_X + indent,
          y + PAD_Y + (row.kind === "grand" ? 1.5 : 0),
          {
            ...opts,
            width: opts.width - indent,
          },
        );
        const note = row.notes?.[i];
        if (note) {
          doc.font("R").fontSize(noteSize).fillColor(C.subtle);
          doc.text(note, xs[i]! + PAD_X + indent, doc.y, {
            width: opts.width - indent,
            align: opts.align,
          });
        }
      });
    }

    const next = block.rows[ri + 1];
    if (!row.kind && next?.kind !== "total" && next?.kind !== "grand") {
      doc
        .moveTo(left, y + h)
        .lineTo(left + width, y + h)
        .lineWidth(0.3)
        .strokeColor(C.rule)
        .stroke();
    }
    doc.x = left;
    doc.y = y + h;
  });
}

/** `inline`: tarayıcının PDF görüntüleyicisinde açılır; indir/yazdır oradan. */
export function pdfResponse(body: Buffer, filename: string): Response {
  const ascii = filename.normalize("NFKD").replace(/[^\w.-]+/g, "-");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
