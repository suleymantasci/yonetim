"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, Card, CardBody, CardHeader, Input, Textarea } from "@yonetim/ui";

import { DEFAULT_NOTICE_TEXT, NOTICE_KINDS, PLACEHOLDERS, type NoticeKind } from "./templates";

/**
 * Alıcı seçimi + şablon. PDF yeni sekmede, POST ile: metin uzun olabilir ve
 * seçili daireler URL'ye sığmayabilir.
 */
export function NoticeComposer({
  filters,
  recipients,
  defaultDueBy,
}: {
  filters: Record<string, string>;
  recipients: { unitId: string; label: string; name: string; total: string; overdue: string | null }[];
  defaultDueBy: string;
}) {
  const t = useTranslations("app.letters");
  const [kind, setKind] = useState<NoticeKind>("payment");
  const [text, setText] = useState(DEFAULT_NOTICE_TEXT.payment);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(recipients.map((r) => r.unitId)));

  const toggleAll = (on: boolean) => setSelected(on ? new Set(recipients.map((r) => r.unitId)) : new Set());

  return (
    <form method="post" action="/panel/evrak/tebligat/pdf" target="_blank" className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {Object.entries(filters).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Card className="lg:col-span-2">
        <CardHeader
          title={t("recipients", { count: selected.size })}
          action={
            recipients.length > 0 ? (
              <label className="flex items-center gap-2 text-xs text-fg-subtle">
                <input
                  type="checkbox"
                  checked={selected.size === recipients.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4"
                />
                {t("selectAll")}
              </label>
            ) : null
          }
        />
        <CardBody className="max-h-[32rem] overflow-y-auto p-0">
          {recipients.length === 0 ? (
            <p className="p-4 text-sm text-fg-subtle">{t("noRecipients")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {recipients.map((r) => (
                <li key={r.unitId}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-hover">
                    <input
                      type="checkbox"
                      name="unitId"
                      value={r.unitId}
                      checked={selected.has(r.unitId)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(r.unitId);
                        else next.delete(r.unitId);
                        setSelected(next);
                      }}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{r.label}</span>
                      <span className="block truncate text-xs text-fg-subtle">{r.name}</span>
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {r.total}
                      {r.overdue ? <span className="block text-xs text-danger-fg">{t("overdueAmount", { amount: r.overdue })}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader title={t("templateTitle")} description={t("templateHint", { keys: PLACEHOLDERS.map((p) => `{${p}}`).join(" ") })} />
        <CardBody className="space-y-4">
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">{t("kind")}</legend>
            {NOTICE_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => {
                    setKind(k);
                    setText(DEFAULT_NOTICE_TEXT[k]);
                  }}
                />
                {t(`noticeKind.${k}`)}
              </label>
            ))}
          </fieldset>
          <label className="block text-xs text-fg-subtle">
            {t("dueBy")}
            <Input name="sonOdeme" type="date" defaultValue={defaultDueBy} className="mt-0.5 h-9 w-48" />
          </label>
          <label className="block text-xs text-fg-subtle">
            {t("body")}
            <Textarea name="body" rows={12} value={text} onChange={(e) => setText(e.target.value)} className="mt-0.5" maxLength={6000} />
          </label>
          {kind === "warning" ? <Alert tone="warning">{t("warningNote")}</Alert> : null}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={selected.size === 0}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
            >
              <FileText aria-hidden className="h-4 w-4" />
              {t("makePdf", { count: selected.size })}
            </button>
          </div>
        </CardBody>
      </Card>
    </form>
  );
}
