import { Bell, Blocks, CircleHelp, Monitor, Moon, Search, Sun } from "lucide-react";
import { formatAmount } from "@yonetim/i18n";
import { ResidentDemo } from "./resident-demo";

export interface ProductMockLabels {
  caption: string;
  collectionRate: string;
  collected: string;
  openRequests: string;
  trend: string;
  chatPrompt: string;
  chatReply: string;
  units: Array<{ door: string; amount: string; state: "paid" | "due" }>;
  paid: string;
  due: string;
}

/** Compact, HTML product excerpt. Navigation and numbers are illustrative. */
export function ProductMock({ locale, labels }: { locale: string; labels: ProductMockLabels }) {
  const tr = locale === "tr";
  const groups = tr ? ["Genel", "Yapı", "Finans", "İletişim", "Operasyon", "Uyum"] : ["General", "Property", "Finance", "Communication", "Operations", "Compliance"];
  return (
    <figure className="product-excerpt" aria-label={labels.caption}>
      <div className="product-excerpt-dashboard">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-border pb-3">
          <div>
            <p className="product-excerpt-title text-ink-fg">{tr ? "Örnek Apartmanı / Genel bakış" : "Sample property / Overview"}</p>
            <figcaption className="mt-1 text-xs text-ink-muted-fg">{labels.caption}</figcaption>
          </div>
          <div className="flex items-center gap-3 text-ink-muted-fg" aria-hidden="true">
            <Search className="h-4 w-4" /><Bell className="h-4 w-4" /><CircleHelp className="h-4 w-4" />
            <span className="flex gap-2 border-s border-ink-border ps-3"><Sun className="h-4 w-4" /><Moon className="h-4 w-4" /><Monitor className="h-4 w-4" /></span>
          </div>
        </div>
        <div className="product-excerpt-body">
          <ul className="product-excerpt-nav" aria-label={tr ? "Panel menü grupları — önizleme" : "Panel menu groups — preview"}>
            {groups.map(group => <li key={group} className="flex items-center gap-2 py-2 text-xs text-ink-muted-fg"><Blocks aria-hidden className="h-3.5 w-3.5" />{group}</li>)}
          </ul>
          <div className="min-w-0">
            <dl className="grid grid-cols-3 gap-3 border-b border-ink-border py-4">
              {[[tr ? "Tahakkuk" : "Accrued", formatAmount(60000, locale)], [tr ? "Tahsilat" : "Collected", formatAmount(45000, locale)], [labels.collectionRate, "%75"]].map(([label, value]) => (
                <div key={label} className="min-w-0"><dt className="text-xs text-ink-muted-fg">{label}</dt><dd className="mt-1 font-heading text-xl font-semibold tabular-nums text-ink-fg">{value}</dd></div>
              ))}
            </dl>
            <table className="w-full text-left text-xs text-ink-fg">
              <thead className="text-ink-muted-fg"><tr><th className="py-3 font-medium">{tr ? "Daire" : "Unit"}</th><th className="py-3 text-right font-medium">{tr ? "Aidat" : "Dues"}</th><th className="py-3 text-right font-medium">{tr ? "Durum" : "Status"}</th></tr></thead>
              <tbody>{labels.units.map(unit => <tr key={unit.door} className="border-t border-ink-border"><td className="py-3">{unit.door}</td><td className="py-3 text-right tabular-nums">{unit.amount}</td><td className="py-3 text-right"><span className={unit.state === "paid" ? "rounded bg-success-soft px-2 py-1 text-success-fg" : "rounded bg-warning-soft px-2 py-1 text-warning-fg"}>{unit.state === "paid" ? labels.paid : labels.due}</span></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
      <ResidentDemo labels={labels} />
    </figure>
  );
}
