"use client";

import { ArrowRight, Merge } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { MergePeoplePreview } from "@yonetim/contracts";
import { Alert, Card, CardBody, CardHeader, Input, Select, Spinner, useToast } from "@yonetim/ui";

import { mergePeople, previewMerge } from "./actions";

/** Cari birleştir: kaynak (silinecek kayıt) → hedef (kalan kayıt). */
export function MergeTool({ people, defaultSource }: { people: { id: string; label: string }[]; defaultSource: string }) {
  const t = useTranslations("app.dataTools");
  const toast = useToast();
  const router = useRouter();
  const [source, setSource] = useState(people.some((p) => p.id === defaultSource) ? defaultSource : "");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<MergePeoplePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = (s: string, tg: string) => {
    setPreview(null);
    setError(null);
    if (!s || !tg || s === tg) return;
    start(async () => {
      const r = await previewMerge(s, tg);
      if (r.ok) setPreview(r.data);
      else setError(r.message);
    });
  };

  const person = (p: MergePeoplePreview["source"], title: string) => (
    <div className="rounded-lg border border-border p-3 text-sm">
      <span className="block text-xs text-fg-subtle">{title}</span>
      <span className="block font-semibold text-fg">{p.name}</span>
      <span className="block text-xs text-fg-subtle">{[p.phone, p.email].filter(Boolean).join(" · ") || "—"}</span>
      <span className="block text-xs">{p.units.join(", ") || t("noUnits")}</span>
    </div>
  );

  return (
    <Card id="birlestir">
      <CardHeader title={t("mergeTitle")} description={t("mergeHint")} />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <label className="text-xs text-fg-subtle">
            {t("source")}
            <Select value={source} onChange={(e) => { setSource(e.target.value); load(e.target.value, target); }} className="mt-0.5">
              <option value="">{t("pick")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
          <ArrowRight aria-hidden className="mx-auto hidden h-5 w-5 text-fg-subtle sm:block" />
          <label className="text-xs text-fg-subtle">
            {t("target")}
            <Select value={target} onChange={(e) => { setTarget(e.target.value); load(source, e.target.value); }} className="mt-0.5">
              <option value="">{t("pick")}</option>
              {people.filter((p) => p.id !== source).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        {pending && !preview ? <Spinner label={t("loading")} /> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {preview ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {person(preview.source, t("sourceCard"))}
              {person(preview.target, t("targetCard"))}
            </div>
            <div className="text-sm">
              <span className="font-semibold text-fg">{t("moves")}</span>
              {Object.keys(preview.moves).length === 0 ? (
                <p className="text-fg-subtle">{t("noMoves")}</p>
              ) : (
                <ul className="mt-1 list-inside list-disc text-fg-muted">
                  {Object.entries(preview.moves).map(([k, n]) => (
                    <li key={k}>{t("moveLine", { what: t.has(`table.${k.replace(".", "_")}`) ? t(`table.${k.replace(".", "_")}`) : k, count: n })}</li>
                  ))}
                </ul>
              )}
            </div>
            <Alert tone="warning">{t("irreversible")}</Alert>
            <label className="block text-xs text-fg-subtle">
              {t("reason")}
              <Input value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={300} placeholder={t("reasonPlaceholder")} className="mt-0.5" />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={pending || reason.trim().length < 10}
                onClick={() =>
                  start(async () => {
                    const r = await mergePeople(source, target, reason);
                    if (r.ok) {
                      toast.success(r.message);
                      setPreview(null);
                      setSource("");
                      setTarget("");
                      setReason("");
                      router.refresh();
                    } else toast.error(r.message);
                  })
                }
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-primary-fg hover:brightness-95 disabled:opacity-50"
              >
                <Merge aria-hidden className="h-4 w-4" />
                {t("mergeAction")}
              </button>
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}
