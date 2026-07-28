import { ArrowRight, Minus } from "lucide-react";

/**
 * Karşılaştırma defteri — "bugün elde nasıl yürüyor" ↔ "panelde nereye düşüyor".
 *
 * NEDEN ÜÇ KART DEĞİL: Önceki hâli üç eşit kutuydu ("Aidat toplamak dertten
 * çıktı", ...). Üç eşit kutu, sayfanın geri kalanındaki dört ızgarayla aynı
 * şekle sahip; ziyaretçi hepsini tek bir doku olarak görüyor ve okumuyor.
 * Defter biçimi bir **karşılaştırma** yapıyor: satırlar eşleşiyor, gözün
 * soldan sağa gitmesi gereken bir nedeni oluyor.
 *
 * DOMAİN BAĞI: Yönetim işinin kendi aracı defterdir (karar defteri, işletme
 * defteri). Biçim, ürünün konusundan geliyor — jenerik bir "before/after"
 * bileşeni değil.
 *
 * SUNUCU BİLEŞENİ: Hiç etkileşim yok, dolayısıyla hiç JavaScript yok.
 *
 * DÜRÜSTLÜK: Sol sütunda rakip ürün adı geçmez. Karşılaştırılan şey bir rakip
 * değil, **yazılımsız yürüyen yönetim**. Rakip karşılaştırması ayrı sayfada ve
 * kaynaklı yapılır.
 */

export interface LedgerProps {
  beforeLabel: string;
  afterLabel: string;
  /** Eşleşen satırlar; `before[i]` ile `after[i]` aynı işin iki hâli. */
  rows: { before: string; after: string }[];
}

export function Ledger({ beforeLabel, afterLabel, rows }: LedgerProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Başlık satırı — mobilde gizli: orada sütunlar alt alta düşer ve
          satır içi işaretler (− / →) zaten hangi tarafta olduğunu söyler. */}
      <div className="hidden md:grid md:grid-cols-2">
        <p className="border-b border-border bg-surface-sunken px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          {beforeLabel}
        </p>
        <p className="border-b border-s border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          {afterLabel}
        </p>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.after} className="grid md:grid-cols-2">
            <div className="flex gap-3 bg-surface-sunken px-5 py-4">
              <Minus aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
              <p className="text-sm leading-relaxed text-fg-muted">{row.before}</p>
            </div>
            <div className="flex gap-3 border-s-0 border-border px-5 py-4 md:border-s">
              <ArrowRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm font-medium leading-relaxed text-fg">{row.after}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
