import { FileText } from "lucide-react";
import Link from "@/components/link";
import { getTranslations } from "next-intl/server";

import type { MaintenanceLogRow } from "@yonetim/contracts";

import { formatters } from "@/lib/format";
import { attachmentHref } from "@/lib/attachment-href";

/**
 * Bakım geçmişi listesi — her "yapıldı" olayı bir satır.
 *
 * İki yerde kullanılıyor: bakım sayfasındaki "Son yapılan bakımlar" (site
 * geneli, `showRecord`) ve kaydın düzenleme ekranı/çekmecesi (tek kayıt).
 * Tablo değil liste: telefonda yatay kaydırma olmadan okunuyor.
 */
export async function MaintenanceHistory({
  rows,
  showRecord = false,
}: {
  rows: MaintenanceLogRow[];
  showRecord?: boolean;
}) {
  const t = await getTranslations("app.maintenance");
  const tLib = await getTranslations("maintenance");
  const f = await formatters();

  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">{t("historyEmpty")}</p>;
  }

  const labelFor = (row: MaintenanceLogRow) =>
    row.templateCode && tLib.has(`template.${row.templateCode}.name`)
      ? tLib(`template.${row.templateCode}.name`)
      : row.recordLabel;

  return (
    <ol className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              {showRecord ? (
                <Link
                  href={`/panel/bakim/${row.recordId}/duzenle`}
                  className="font-medium text-fg [overflow-wrap:anywhere] hover:underline"
                >
                  {labelFor(row)}
                </Link>
              ) : null}
              <div
                className={
                  showRecord
                    ? "text-xs text-fg-muted"
                    : "text-sm font-medium text-fg"
                }
              >
                {f.date(row.doneAt)}
              </div>
            </div>
            {row.costMinor > 0 ? (
              <span className="shrink-0 text-sm tabular-nums text-fg">
                {f.money(row.costMinor)}
              </span>
            ) : null}
          </div>
          {row.note ? (
            <p className="mt-1 whitespace-pre-line text-sm text-fg-muted [overflow-wrap:anywhere]">
              {row.note}
            </p>
          ) : null}
          {attachmentHref(row.documentUrl) || row.createdByName ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
              {attachmentHref(row.documentUrl) ? (
                <a
                  href={attachmentHref(row.documentUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <FileText aria-hidden className="h-3.5 w-3.5" />
                  {t("historyDocument")}
                </a>
              ) : null}
              {row.createdByName ? (
                <span>{t("historyBy", { name: row.createdByName })}</span>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
