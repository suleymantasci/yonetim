"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, Badge, Card, CardBody, CardHeader, Field, Input, Textarea } from "@yonetim/ui";

import type { ActionState } from "@/lib/form";
import { archiveTenant, restoreTenant } from "./actions";

const IDLE: ActionState = { status: "idle" };

/**
 * "Bu siteyle işim bitti" — tehlikeli bölge.
 *
 * NEDEN VARDI DA YOKTU: `tenant_status` enum'unda `archived` baştan beri
 * duruyordu ama onu yazan hiçbir yol yoktu. Bir yönetici bir siteyi devrettiğinde
 * ya da yönetim şirketi bir siteyle sözleşmesini bitirdiğinde yapabileceği
 * hiçbir şey yoktu: site sonsuza kadar listede, panelde ve faturada duruyordu.
 *
 * ADI YAZDIRARAK ONAY: arşivleme geri alınabilir ama sitenin herkes için
 * salt-okunur olması demek — aidat üretimi, tahsilat, duyuru durur. Tek tık
 * yeterli olsaydı, yanlış siteyi seçen bir yönetici bunu ancak sakinlerden
 * gelen şikâyetle fark ederdi. Onay kutusu değil **ad yazma**, çünkü
 * kutu işaretlemek okumadan yapılabilen bir hareket.
 */
export function LifecycleCard({
  state,
}: {
  state: {
    name: string;
    status: string;
    archivedAt: Date | null;
    archivedByName: string | null;
    purgeAfterAt: Date | null;
    archiveReason: string | null;
    daysLeftToRecover: number | null;
    recoveryWindowDays: number;
    canArchive: boolean;
    canRestore: boolean;
  };
  /** Yalnız `tenant:archive` yetkisi olanlar bu kartı görüyor. */
}) {
  const t = useTranslations("app.settings.lifecycle");

  return (
    <Card className="border-danger">
      <CardHeader
        title={t("title")}
        description={t("description", { days: state.recoveryWindowDays })}
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-subtle">{t("currentStatus")}</span>
          <Badge tone={state.status === "archived" ? "warning" : "success"}>
            {t(`status.${state.status === "archived" ? "archived" : "open"}`)}
          </Badge>
        </div>

        {state.canRestore ? (
          <>
            <Alert tone="warning" title={t("archivedTitle")}>
              <p>
                {t("archivedBody", {
                  by: state.archivedByName ?? "—",
                  days: state.daysLeftToRecover ?? 0,
                })}
              </p>
              {state.archiveReason ? (
                <p className="mt-1 italic">“{state.archiveReason}”</p>
              ) : null}
            </Alert>
            <RestoreForm />
          </>
        ) : null}

        {state.canArchive ? <ArchiveForm siteName={state.name} /> : null}
      </CardBody>
    </Card>
  );
}

function SubmitButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending || disabled}
      className="rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-danger-fg disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function ArchiveForm({ siteName }: { siteName: string }) {
  const t = useTranslations("app.settings.lifecycle");
  const [actionState, action] = useActionState<ActionState, FormData>(archiveTenant, IDLE);
  const [confirmation, setConfirmation] = useState("");

  /*
   * Karşılaştırma büyük/küçük harf ve baştaki-sondaki boşluğa duyarsız:
   * amaç yöneticiyi hangi siteyi kapattığını okumaya zorlamak, imla
   * sınavından geçirmek değil.
   */
  const matches =
    confirmation.trim().toLocaleLowerCase("tr") === siteName.trim().toLocaleLowerCase("tr");

  return (
    <form action={action} className="space-y-3">
      {actionState.status === "error" && actionState.message ? (
        <Alert tone="danger">{actionState.message}</Alert>
      ) : null}

      <Field
        label={t("reasonLabel")}
        hint={t("reasonHint")}
        error={actionState.fieldErrors?.reason?.[0]}
        required
      >
        <Textarea name="reason" required minLength={10} maxLength={500} rows={2} />
      </Field>

      <Field label={t("confirmLabel", { name: siteName })} required>
        <Input
          name="confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          required
        />
      </Field>

      <p className="text-xs text-fg-subtle">{t("archiveEffects")}</p>
      <SubmitButton label={t("archiveAction")} disabled={!matches} />
    </form>
  );
}

function RestoreForm() {
  const t = useTranslations("app.settings.lifecycle");
  const [actionState, action] = useActionState<ActionState, FormData>(restoreTenant, IDLE);

  return (
    <form action={action} className="space-y-3">
      {actionState.status === "error" && actionState.message ? (
        <Alert tone="danger">{actionState.message}</Alert>
      ) : null}
      <Field
        label={t("restoreReasonLabel")}
        error={actionState.fieldErrors?.reason?.[0]}
        required
      >
        <Textarea name="reason" required minLength={10} maxLength={500} rows={2} />
      </Field>
      <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
        {t("restoreAction")}
      </button>
    </form>
  );
}
