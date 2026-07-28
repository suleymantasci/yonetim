import type { ReactNode } from "react";

/**
 * Minimal markdown render — başlık, paragraf, liste, tablo, kalın metin.
 * Harici bağımlılık kullanmadan blog içeriklerini render eder.
 *
 * TİPOGRAFİ: Gövde metni `text-fg`, ikincil renk değil. Uzun metinde
 * `fg-muted` kontrastı AA'yı geçse de okuma yorgunluğunu belirgin biçimde
 * artırıyor; soluk renk yardımcı metin (tarih, etiket, açıklama) için ayrıldı.
 * Satır yüksekliği 1.75 ve gövde 17px: ~70 karakterlik ölçüde uzun okuma için
 * yerleşik aralık.
 *
 * BAŞLIKLARA KİMLİK: `##` ve `###` blokları `id` alıyor. Bu hem içindekiler
 * tablosunun hem de paylaşılabilir derin bağlantıların önkoşulu — ikisi de
 * öncesinde mümkün değildi.
 */

/**
 * Blok sınırlarını düzeltir.
 *
 * Bölümleyici boş satıra göre ayırıyor; oysa kaynak metinlerin bir kısmında
 * başlıktan sonra **tek** satır sonu var (`packages/kvkk` aydınlatma metni
 * böyle yazılmış). O hâlde `## Başlık\nGövde` tek blok sayılıyor ve blok
 * `## ` ile başladığı için **bölümün tamamı başlık olarak** render ediliyordu
 * — KVKK sayfası uzunca bir süre böyle görünmüş. Aynı şey listeden sonra
 * gelen düz metin için de geçerli: liste tanımı "her satır madde olmalı"
 * dediğinden, sondaki bir cümle tüm listeyi paragrafa düşürüyordu.
 *
 * Kaynak metinleri düzeltmek yerine burada normalleştiriliyor: metinler
 * hukuki içerik ve başka yerlerde de kullanılıyor, biçimlendirme kuralı
 * render katmanının sorunu.
 */
function normalizeBlocks(markdown: string): string {
  return markdown
    .replace(/^(#{2,3} .+)\n(?!\n)/gm, "$1\n\n")
    .replace(/^([-*] .+|\d+\. .+)\n(?![-*] |\d+\. |\n)/gm, "$1\n\n");
}

/** Türkçe harfleri koruyarak URL parçası üretir. */
export function slugifyHeading(text: string): string {
  const map: Record<string, string> = {
    ı: "i", İ: "i", ğ: "g", Ğ: "g", ü: "u", Ü: "u",
    ş: "s", Ş: "s", ö: "o", Ö: "o", ç: "c", Ç: "c",
  };
  return text
    .replace(/\*\*/g, "")
    .trim()
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => map[char] ?? char)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface MarkdownHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

/** İçindekiler tablosu için `##`/`###` başlıkları — render'la aynı kimlikler. */
export function extractHeadings(markdown: string): MarkdownHeading[] {
  return normalizeBlocks(markdown)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .flatMap<MarkdownHeading>((block) => {
      if (block.startsWith("### ")) {
        const text = block.slice(4);
        return [{ id: slugifyHeading(text), text, level: 3 }];
      }
      if (block.startsWith("## ")) {
        const text = block.slice(3);
        return [{ id: slugifyHeading(text), text, level: 2 }];
      }
      return [];
    });
}

export function renderMarkdown(markdown: string): ReactNode[] {
  const blocks = normalizeBlocks(markdown).split(/\n{2,}/);
  return blocks.map((block, i) => {
    const key = `b${i}`;
    const trimmed = block.trim();

    if (trimmed.startsWith("### ")) {
      const text = trimmed.slice(4);
      return (
        <h3
          key={key}
          id={slugifyHeading(text)}
          className="mt-8 scroll-mt-24 font-heading text-xl font-bold text-fg"
        >
          {inline(text)}
        </h3>
      );
    }
    if (trimmed.startsWith("## ")) {
      const text = trimmed.slice(3);
      return (
        <h2
          key={key}
          id={slugifyHeading(text)}
          className="mt-12 scroll-mt-24 border-t border-border pt-8 font-heading text-2xl font-extrabold tracking-tight text-fg first:mt-0 first:border-0 first:pt-0"
        >
          {inline(text)}
        </h2>
      );
    }
    if (trimmed.startsWith("| ")) {
      return <MarkdownTable key={key} block={trimmed} />;
    }
    if (/^[-*] /m.test(trimmed) && trimmed.split("\n").every((l) => /^[-*] /.test(l.trim()))) {
      return (
        <ul key={key} className="mt-5 space-y-2 ps-5 text-[1.0625rem] leading-[1.75] text-fg">
          {trimmed.split("\n").map((line, j) => (
            <li key={`${key}-${j}`} className="list-disc marker:text-primary">
              {inline(line.replace(/^[-*] /, ""))}
            </li>
          ))}
        </ul>
      );
    }
    if (/^\d+\. /m.test(trimmed) && trimmed.split("\n").every((l) => /^\d+\. /.test(l.trim()))) {
      return (
        <ol key={key} className="mt-5 space-y-2 ps-5 text-[1.0625rem] leading-[1.75] text-fg">
          {trimmed.split("\n").map((line, j) => (
            <li key={`${key}-${j}`} className="list-decimal marker:font-semibold marker:text-primary">
              {inline(line.replace(/^\d+\. /, ""))}
            </li>
          ))}
        </ol>
      );
    }
    return (
      <p key={key} className="mt-5 text-[1.0625rem] leading-[1.75] text-fg">
        {inline(trimmed)}
      </p>
    );
  });
}

function MarkdownTable({ block }: { block: string }) {
  const lines = block.split("\n").filter((l) => l.trim().length > 0);
  const rows = lines
    .filter((l) => !/^\|[\s:-]+\|$/.test(l.replace(/\s/g, "")))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  const [header, ...body] = rows;
  if (!header) return null;

  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-surface-sunken text-start">
          <tr>
            {header.map((h) => (
              <th key={h} scope="col" className="px-4 py-2.5 text-start font-semibold text-fg">
                {inline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={`r${i}`} className="border-t border-border">
              {row.map((cell, j) => (
                <td key={`c${j}`} className="px-4 py-2.5 text-fg-muted">
                  {inline(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-fg">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
