import { Check, Minus } from "lucide-react";
import type { ReactNode } from "react";

import type { ComparisonRow } from "@/content";

/**
 * Rakip karşılaştırması.
 *
 * DÜZELTİLEN ERİŞİLEBİLİRLİK HATASI: Önceki hâlde "var" hücresi
 * `<span aria-hidden>✓</span>`, "yok" hücresi ise yalnız `aria-hidden` bir
 * tire içeriyordu. Ekran okuyucu için tablonun tamamı **boş hücrelerden**
 * ibaretti — yani karşılaştırma, gören olmayan bir kullanıcı için hiçbir bilgi
 * taşımıyordu. Artık her hücrede işaretle birlikte okunabilir bir metin var.
 *
 * YATAY KAYDIRMA YOK: Beş sütunlu tablo `lg` altında karta dönüşüyor. Eski
 * `overflow-x-auto` + `min-w-[640px]` bileşimi telefonda başlık satırını görüş
 * alanının dışına taşıyor, hangi sütunun hangi sağlayıcı olduğunu
 * kaybettiriyordu. `lg` üstünde kaydırma kabı olmadığı için yapışkan başlık
 * gerçekten çalışıyor.
 */

export interface ComparisonLabels {
  feature: string;
  us: string;
  partial: string;
  soon: string;
  yes: string;
  no: string;
  caption: string;
}

type Verdict = boolean | "partial" | "soon";

/** Sütun sırası ve etiketleri — "biz" her zaman ilk sağlayıcı sütunu. */
const PROVIDERS: { key: keyof Omit<ComparisonRow, "feature">; name: string | null }[] = [
  { key: "us", name: null }, // adı `labels.us`'ten gelir
  { key: "apsiyon", name: "Apsiyon" },
  { key: "biyos", name: "Biyos" },
  { key: "yonetimcell", name: "Yönetimcell" },
];

function verdictContent(value: Verdict, labels: ComparisonLabels): ReactNode {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-success-fg">
        <Check aria-hidden className="h-4 w-4" />
        {labels.yes}
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1.5 text-fg-subtle">
        <Minus aria-hidden className="h-4 w-4" />
        {labels.no}
      </span>
    );
  }
  return (
    <span className="text-warning-fg">{value === "soon" ? labels.soon : labels.partial}</span>
  );
}

export function ComparisonTable({
  rows,
  labels,
}: {
  rows: ComparisonRow[];
  labels: ComparisonLabels;
}) {
  const providerLabel = (index: number) => PROVIDERS[index]!.name ?? labels.us;

  /*
    İKİ AYRINTI, İKİSİ DE GÖRÜNÜR HATAYA YOL AÇMIŞTI:

    1. Zemin sınıfı tek yerden. Önce `headCell` içinde `bg-surface-sunken`
       vardı ve "biz" sütununa `bg-primary-soft` **eklenerek** geçiliyordu.
       Aynı özelliği veren iki Tailwind sınıfı bir aradayken hangisinin
       kazanacağını sınıf listesindeki sıra değil, üretilen CSS'teki sıra
       belirler — burada `bg-surface-sunken` kazanmıştı. Sonuç: gövdede mavi
       şeritli bir sütun, başlığında şeritsiz bir hücre; sütun kaymış gibi
       görünüyordu.

    2. `border-separate`. `border-collapse` ile hücre kenarlıkları tabloya
       aitken yapışkan hücreyle birlikte hareket etmez; başlık satırının alt
       çizgisi yerinde kalır, satırlar başlığın altına çizgisiz girer.
       `border-separate` + `border-spacing-0` görünümü değiştirmiyor ama
       kenarlığı hücrenin kendisine bağlıyor.
  */
  const headCell = (highlight: boolean) =>
    "sticky top-16 z-10 border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide " +
    (highlight ? "bg-primary-soft text-primary-soft-fg" : "bg-surface-sunken");

  /*
    SARMALAYICIDA `overflow-hidden` YOK — köşeleri hücreler yuvarlıyor.
    `overflow: hidden` bir kaydırma kabı yaratıyor ve yapışkan öğe o kaba
    göre konumlanıyor: `top: 64px` görüş alanından değil **tablonun
    tepesinden** ölçülüyordu, yani başlık satırı 64px aşağı kayıp ilk veri
    satırının üstüne biniyordu. Tarayıcıda ölçüldü: tablo tepesi 50px,
    başlık 114px.
  */
  return (
    <>
      <div className="hidden rounded-2xl border border-border lg:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{labels.caption}</caption>
          <thead className="text-left text-fg-subtle">
            <tr>
              <th scope="col" className={`${headCell(false)} rounded-ss-2xl`}>
                {labels.feature}
              </th>
              {PROVIDERS.map((provider, index) => (
                <th
                  key={provider.key}
                  scope="col"
                  className={
                    headCell(index === 0) +
                    (index === PROVIDERS.length - 1 ? " rounded-se-2xl" : "")
                  }
                >
                  {providerLabel(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const line = rowIndex === 0 ? "" : " border-t border-border";
              const last = rowIndex === rows.length - 1;
              return (
                <tr key={row.feature}>
                  <th
                    scope="row"
                    className={
                      "px-4 py-3 text-start font-medium text-fg" +
                      line +
                      (last ? " rounded-es-2xl" : "")
                    }
                  >
                    {row.feature}
                  </th>
                  {PROVIDERS.map((provider, index) => (
                    <td
                      key={provider.key}
                      className={
                        "px-4 py-3" +
                        line +
                        (index === 0 ? " bg-primary-soft/40" : "") +
                        (last && index === PROVIDERS.length - 1 ? " rounded-ee-2xl" : "")
                      }
                    >
                      {verdictContent(row[provider.key] as Verdict, labels)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li key={row.feature} className="rounded-xl border border-border bg-surface p-4">
            <p className="font-medium text-fg">{row.feature}</p>
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              {PROVIDERS.map((provider, index) => (
                <div
                  key={provider.key}
                  className={
                    "flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 " +
                    (index === 0 ? "bg-primary-soft" : "bg-surface-sunken")
                  }
                >
                  <dt className={index === 0 ? "font-semibold text-fg" : "text-fg-muted"}>
                    {providerLabel(index)}
                  </dt>
                  <dd>{verdictContent(row[provider.key] as Verdict, labels)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
