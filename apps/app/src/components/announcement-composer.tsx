"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState, useTransition } from "react";

import {
  Alert, Card, CardBody, CardFooter, CardHeader, Field, Input, Select, Textarea,
} from "@yonetim/ui";

import {
  checkAnnouncementKvkk, createAnnouncement, type AnnouncementState,
} from "@/app/panel/duyurular/actions";

const INITIAL: AnnouncementState = { ok: false };

const AUDIENCES = ["all", "owners", "tenants", "new_residents"] as const;
const CHANNELS = ["whatsapp", "sms", "email", "in_app"] as const;

/** Duyuru oluşturucu — canlı KVKK kontrolü (SPEC Bölüm 6.4). */
export function AnnouncementComposer({
  /** `announcement:send_urgent` — acil kutusu tüm kanalları açtığı için ayrı. */
  canSendUrgent,
}: {
  canSendUrgent: boolean;
}) {
  const t = useTranslations("app.announcements");
  const tEnum = useTranslations("enum");
  const tKvkk = useTranslations("kvkk");

  const [state, formAction, pending] = useActionState(createAnnouncement, INITIAL);
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof checkAnnouncementKvkk>
  > | null>(null);
  const [checking, startCheck] = useTransition();
  const [text, setText] = useState("");

  const findings = preview?.findings ?? state.kvkk?.findings ?? [];

  return (
    <Card>
      <CardHeader title={t("composerTitle")} description={t("composerDescription")} />
      <form action={formAction}>
        <CardBody className="space-y-4">
          <Field label={t("titleLabel")} required>
            <Input name="title" required maxLength={200} placeholder={t("titlePlaceholder")} />
          </Field>

          <Field label={t("bodyLabel")} required hint={t("bodyHint")}>
            <Textarea
              name="body"
              required
              rows={6}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() =>
                startCheck(async () => {
                  if (text.trim().length > 10) setPreview(await checkAnnouncementKvkk(text));
                })
              }
              placeholder={t("bodyPlaceholder")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("audienceLabel")}>
              <Select name="audience" defaultValue="all">
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {tEnum(`audience.${a}`)}
                  </option>
                ))}
              </Select>
            </Field>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-fg">{t("channelsLabel")}</legend>
              {CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    name="channels"
                    value={c}
                    defaultChecked={c === "whatsapp" || c === "in_app"}
                  />
                  {tEnum(`channel.${c}`)}
                </label>
              ))}
            </fieldset>
          </div>

          {canSendUrgent ? (
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="isUrgent" />
              <span>
                <strong>{t("urgentLabel")}</strong> — {t("urgentDescription")}
              </span>
            </label>
          ) : null}

          {checking ? <p className="text-xs text-fg-subtle">{t("checking")}</p> : null}

          {findings.length > 0 ? (
            <div className="space-y-2">
              {findings.map((finding, i) => (
                <Alert
                  key={`${finding.code}-${i}`}
                  tone={finding.severity === "block" ? "danger" : "warning"}
                >
                  <strong>
                    {finding.severity === "block" ? t("blockedPrefix") : t("warningPrefix")}{" "}
                  </strong>
                  {tKvkk(`finding.${finding.code}.message`)}
                  <div className="mt-1 text-xs opacity-80">
                    {t("detected", { match: finding.match })} —{" "}
                    {tKvkk(`finding.${finding.code}.suggestion`)}
                  </div>
                </Alert>
              ))}
            </div>
          ) : null}

          {state.message ? (
            <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
          ) : null}
          {state.fieldErrors
            ? Object.entries(state.fieldErrors).map(([field, errs]) => (
                <Alert key={field} tone="danger">
                  {errs.join(" ")}
                </Alert>
              ))
            : null}
        </CardBody>

        <CardFooter className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? t("sending") : t("publishAndSend")}
          </button>
          <button
            type="submit"
            name="publish"
            value="off"
            disabled={pending}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
          >
            {t("saveDraft")}
          </button>
        </CardFooter>
      </form>
    </Card>
  );
}
