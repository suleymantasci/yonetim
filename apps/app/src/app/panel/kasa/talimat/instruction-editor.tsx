"use client";

import { FileText, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Card, CardBody, CardHeader, Input, Select } from "@yonetim/ui";

interface Line {
  key: number;
  name: string;
  iban: string;
  description: string;
  amount: string;
}

const validIban = (v: string) => /^TR\d{24}$/.test(v.replace(/\s/g, "").toUpperCase());

/** Talimat satırları — firma/personel seçimi IBAN'ı doldurur; elle de girilebilir. */
export function InstructionEditor({
  payees,
  accounts,
  today,
}: {
  payees: { kind: "vendor" | "staff"; id: string; name: string; iban: string | null }[];
  accounts: { id: string; label: string }[];
  today: string;
}) {
  const t = useTranslations("app.instruction");
  const [lines, setLines] = useState<Line[]>([{ key: 1, name: "", iban: "", description: "", amount: "" }]);
  const set = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.amount.replace(/\./g, "").replace(",", ".")) || 0), 0);
  const ready = lines.length > 0 && lines.every((l) => l.name.trim() && validIban(l.iban) && Number(l.amount.replace(/\./g, "").replace(",", ".")) > 0);

  return (
    <form method="post" action="/panel/kasa/talimat/pdf" target="_blank" className="space-y-4">
      <Card>
        <CardHeader title={t("header")} />
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-fg-subtle">
            {t("date")}
            <Input name="tarih" type="date" defaultValue={today} className="mt-0.5" />
          </label>
          <label className="text-xs text-fg-subtle">
            {t("account")}
            <Select name="hesap" defaultValue={accounts[0]?.label ?? ""} className="mt-0.5">
              {accounts.length === 0 ? <option value="">{t("noAccounts")}</option> : null}
              {accounts.map((a) => (
                <option key={a.id} value={a.label}>
                  {a.label}
                </option>
              ))}
            </Select>
          </label>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("lines", { count: lines.length })} description={t("linesHint")} />
        <CardBody className="space-y-3">
          {lines.map((l, i) => (
            <fieldset key={l.key} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-12">
              <legend className="sr-only">{t("line", { n: i + 1 })}</legend>
              <label className="text-xs text-fg-subtle sm:col-span-3">
                {t("pick")}
                <Select
                  value=""
                  onChange={(e) => {
                    const p = payees.find((x) => `${x.kind}:${x.id}` === e.target.value);
                    if (p) set(l.key, { name: p.name, iban: p.iban ?? "" });
                  }}
                  className="mt-0.5"
                >
                  <option value="">{t("pickPlaceholder")}</option>
                  {payees.map((p) => (
                    <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>
                      {p.name} · {t(`kind.${p.kind}`)}
                      {p.iban ? "" : ` (${t("noIban")})`}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-xs text-fg-subtle sm:col-span-3">
                {t("name")}
                <Input name="ad" value={l.name} onChange={(e) => set(l.key, { name: e.target.value })} required maxLength={120} className="mt-0.5" />
              </label>
              <label className="text-xs text-fg-subtle sm:col-span-3">
                {t("iban")}
                <Input
                  name="iban"
                  value={l.iban}
                  onChange={(e) => set(l.key, { iban: e.target.value.toUpperCase() })}
                  required
                  maxLength={34}
                  aria-invalid={l.iban !== "" && !validIban(l.iban)}
                  className="mt-0.5 font-mono"
                />
              </label>
              <label className="text-xs text-fg-subtle sm:col-span-2">
                {t("amount")}
                <Input name="tutar" value={l.amount} onChange={(e) => set(l.key, { amount: e.target.value })} inputMode="decimal" required className="mt-0.5 text-right" placeholder="0,00" />
              </label>
              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                  aria-label={t("remove", { n: i + 1 })}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-danger-fg"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </div>
              <label className="text-xs text-fg-subtle sm:col-span-12">
                {t("description")}
                <Input name="aciklama" value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} maxLength={140} className="mt-0.5" />
              </label>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setLines([...lines, { key: Date.now(), name: "", iban: "", description: "", amount: "" }])}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("addLine")}
            </button>
            <span className="text-sm font-semibold tabular-nums">
              {t("total")}: ₺{total.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </CardBody>
      </Card>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!ready}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
        >
          <FileText aria-hidden className="h-4 w-4" />
          {t("makePdf")}
        </button>
      </div>
    </form>
  );
}
