import { formatAmount } from "@yonetim/i18n";

/** Financial rows are an explicitly labelled sample, never customer records. */
export function DuesExcerpt({ locale }: { locale: string }) {
  const tr = locale === "tr";
  return (
    <div className="mt-7 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="mb-3 text-left text-xs text-fg-subtle">{tr ? "Aidat kayıtları — örnek veriler" : "Dues records — sample data"}</caption>
        <thead className="border-b border-border text-xs text-fg-subtle"><tr>{(tr ? ["Daire", "Açıklama", "Tutar", "Durum"] : ["Unit", "Description", "Amount", "Status"]).map(label => <th key={label} className="px-2 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{[1, 8, 3].map((door, index) => <tr key={door} className="border-b border-border"><td className="px-2 py-4">A / {door}</td><td className="px-2 py-4">{tr ? "Aidat" : "Dues"}</td><td className="whitespace-nowrap px-2 py-4 tabular-nums">{formatAmount(1250, locale)}</td><td className="px-2 py-4"><span className={index === 1 ? "rounded bg-warning-soft px-2 py-1 text-xs text-warning-fg" : "rounded bg-success-soft px-2 py-1 text-xs text-success-fg"}>{index === 1 ? (tr ? "Bekliyor" : "Pending") : (tr ? "Ödendi" : "Paid")}</span></td></tr>)}</tbody>
      </table>
    </div>
  );
}
