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
    <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-lg">
      {/* Başlık satırı */}
      <div className="hidden border-b border-border bg-surface-sunken/80 md:grid md:grid-cols-2">
        <div className="flex items-center gap-2 px-6 py-3.5 text-xs font-semibold text-fg-subtle">
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          <span>{beforeLabel}</span>
        </div>
        <div className="flex items-center gap-2 border-s border-border/60 px-6 py-3.5 text-xs font-semibold text-primary">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span>{afterLabel}</span>
        </div>
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.after}
            className="group grid transition-colors duration-150 hover:bg-hover/60 md:grid-cols-2"
          >
            {/* Sol: Manuel / Eski Yöntem */}
            <div className="flex items-start gap-3.5 bg-surface-sunken/40 px-6 py-4.5 group-hover:bg-surface-sunken/70">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border text-fg-subtle">
                <Minus aria-hidden="true" className="h-3 w-3" />
              </span>
              <p className="text-sm leading-relaxed text-fg-muted">{row.before}</p>
            </div>

            {/* Sağ: Yönetimcell ile Otomatik */}
            <div className="flex items-start gap-3.5 border-s-0 border-border px-6 py-4.5 md:border-s">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ArrowRight aria-hidden="true" className="h-3 w-3" />
              </span>
              <p className="text-sm font-semibold leading-relaxed text-fg">{row.after}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

