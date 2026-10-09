"use client";

import { Eye, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  MEMBER_SCOPES,
  NOTICE_KINDS_BULK,
  NOTICE_PLACEHOLDERS,
  type BulkNoticePreview,
  type BulkNoticeResult,
} from "@yonetim/contracts";
import { Alert, Card, CardBody, CardHeader, Input, Select, Textarea, useToast } from "@yonetim/ui";

import { previewNotice, sendNotice } from "./actions";

type Kind = (typeof NOTICE_KINDS_BULK)[number];

const money = (kurus: number) =>
  `₺${(kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Toplu bildirim düzenleyicisi. Akış: tür → süzgeç → alıcıları getir (seç /
 * çıkar) → metin → kanal → gönder. Gönder düğmesi önizleme alınmadan pasif:
 * yanlış süzgeçle 200 kişiye yazmak geri alınamaz.
 */
export function NoticeComposer({
  blocks,
  debtTypes,
}: {
  blocks: { id: string; name: string }[];
  debtTypes: { id: string; name: string }[];
}) {
  const t = useTranslations("app.bulkNotice");
  const tMember = useTranslations("app.memberScope");
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("text");
  const [filters, setFilters] = useState({ blockId: "", member: "", debtTypeId: "", periodUntil: "", min: "" });
  const [subject, setSubject] = useState(() => t.raw("defaults.text.subject") as string);
  const [body, setBody] = useState(() => t.raw("defaults.text.body") as string);
  const [channels, setChannels] = useState<string[]>(["in_app", "email"]);
  const [includeItems, setIncludeItems] = useState(true);
  const [preview, setPreview] = useState<BulkNoticePreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<BulkNoticeResult | null>(null);
  const [pending, start] = useTransition();
  const isDebt = kind === "debt" || kind === "tenant_debt";

  const query = () => ({
    kind,
    blockId: filters.blockId || undefined,
    member: kind === "tenant_debt" ? undefined : filters.member || undefined,
    debtTypeId: isDebt ? filters.debtTypeId || undefined : undefined,
    periodUntil: isDebt ? filters.periodUntil || undefined : undefined,
    minTotal: isDebt && Number(filters.min) > 0 ? Math.round(Number(filters.min.replace(",", ".")) * 100) : undefined,
  });

  function chooseKind(k: Kind) {
    setKind(k);
    setSubject(t.raw(`defaults.${k}.subject`) as string);
    setBody(t.raw(`defaults.${k}.body`) as string);
    setPreview(null);
    setResult(null);
  }

  function load() {
    start(async () => {
      const r = await previewNotice(query());
      if (!r.ok) return void toast.error(r.message);
      setPreview(r.data);
      setSelected(new Set(r.data.recipients.map((x) => x.userId)));
      setResult(null);
    });
  }

  function send() {
    start(async () => {
      const r = await sendNotice({ ...query(), subject, body, channels, includeItems, userIds: [...selected] });
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setResult(r.data);
    });
  }

  const setF = (k: keyof typeof filters) => (e: { target: { value: string } }) => {
    setFilters({ ...filters, [k]: e.target.value });
    setPreview(null);
  };
  const recipients = preview?.recipients ?? [];
  const withEmail = recipients.filter((r) => selected.has(r.userId) && r.hasEmail).length;

  return (
    <div className="space-y-4">
      <nav aria-label={t("kindLabel")} className="relative flex gap-1 overflow-x-auto border-b border-border">
        {NOTICE_KINDS_BULK.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => chooseKind(k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              k === kind ? "border-primary text-fg" : "border-transparent text-fg-subtle hover:text-fg"
            }`}
          >
            {t(`kind.${k}`)}
          </button>
        ))}
      </nav>
      <p className="text-sm text-fg-muted">{t(`kindHint.${kind}`)}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title={t("recipientsTitle", { count: selected.size })} />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-fg-subtle">
                {t("block")}
                <Select value={filters.blockId} onChange={setF("blockId")} className="mt-0.5 h-9">
                  <option value="">{t("allBlocks")}</option>
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </label>
              {kind !== "tenant_debt" ? (
                <label className="text-xs text-fg-subtle">
                  {tMember("label")}
                  <Select value={filters.member} onChange={setF("member")} className="mt-0.5 h-9">
                    <option value="">{isDebt ? tMember("all") : t("activeDefault")}</option>
                    {MEMBER_SCOPES.filter((s) => s !== "all").map((s) => (
                      <option key={s} value={s}>
                        {tMember(s)}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              {isDebt ? (
                <>
                  <label className="text-xs text-fg-subtle">
                    {t("debtType")}
                    <Select value={filters.debtTypeId} onChange={setF("debtTypeId")} className="mt-0.5 h-9">
                      <option value="">{t("allTypes")}</option>
                      {debtTypes.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-xs text-fg-subtle">
                    {t("periodUntil")}
                    <Input type="month" value={filters.periodUntil} onChange={setF("periodUntil")} className="mt-0.5 h-9" />
                  </label>
                  <label className="text-xs text-fg-subtle">
                    {t("minAmount")}
                    <Input inputMode="decimal" value={filters.min} onChange={setF("min")} placeholder="500" className="mt-0.5 h-9" />
                  </label>
                </>
              ) : null}
            </div>
            <button
              type="button"
              onClick={load}
              disabled={pending}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
            >
              <Eye aria-hidden className="h-4 w-4" />
              {t("loadRecipients")}
            </button>
            {preview ? (
              recipients.length === 0 ? (
                <p className="text-sm text-fg-subtle">{t("noRecipients")}</p>
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
                  <label className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-fg-subtle">
                    <input
                      type="checkbox"
                      checked={selected.size === recipients.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(recipients.map((r) => r.userId)) : new Set())}
                      className="h-4 w-4"
                    />
                    {t("selectAll")}
                  </label>
                  <ul className="divide-y divide-border">
                    {recipients.map((r) => (
                      <li key={r.userId}>
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-hover">
                          <input
                            type="checkbox"
                            name="userId"
                            value={r.userId}
                            checked={selected.has(r.userId)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(r.userId);
                              else next.delete(r.userId);
                              setSelected(next);
                            }}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="block font-medium">{r.name}</span>
                            <span className="block truncate text-xs text-fg-subtle">
                              {r.unitLabel}
                              {r.tenantName ? ` · ${t("tenantOf", { name: r.tenantName })}` : ""}
                              {" · "}
                              {r.emailMasked ?? t("noEmail")}
                            </span>
                          </span>
                          {isDebt ? <span className="text-sm tabular-nums">{money(r.debtMinor)}</span> : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}
          </CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title={t("messageTitle")}
            description={t("placeholders", { keys: NOTICE_PLACEHOLDERS.map((p) => `{${p}}`).join(" ") })}
          />
          <CardBody className="space-y-3">
            <label className="block text-xs text-fg-subtle">
              {t("subject")}
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={160} className="mt-0.5" />
            </label>
            <label className="block text-xs text-fg-subtle">
              {t("body")}
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={4000} className="mt-0.5" />
            </label>
            {isDebt ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeItems} onChange={(e) => setIncludeItems(e.target.checked)} className="h-4 w-4" />
                {t("includeItems")}
              </label>
            ) : null}
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-xs text-fg-subtle">{t("channels")}</legend>
              {(["in_app", "email"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={(e) => setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c))}
                    className="h-4 w-4"
                  />
                  {t(`channel.${c}`)}
                  {c === "email" && preview ? <span className="text-xs text-fg-subtle">({t("emailCount", { count: withEmail })})</span> : null}
                </label>
              ))}
              {(["sms", "whatsapp"] as const).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-fg-subtle">
                  <input type="checkbox" disabled className="h-4 w-4" />
                  {t(`channel.${c}`)} <span className="text-xs">({t("pendingIntegration")})</span>
                </label>
              ))}
            </fieldset>
            {result ? (
              <Alert tone="success">
                {t("resultDetail", {
                  recipients: result.recipients,
                  inApp: result.inApp,
                  email: result.emailSent,
                  skipped: result.emailSkipped,
                  failed: result.emailFailed,
                })}
              </Alert>
            ) : null}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={send}
                disabled={pending || !preview || selected.size === 0 || channels.length === 0}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
              >
                <Send aria-hidden className="h-4 w-4" />
                {t("send", { count: selected.size })}
              </button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
