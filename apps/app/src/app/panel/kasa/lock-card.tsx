"use client";

import { Lock, LockOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardBody, CardHeader, Input } from "@yonetim/ui";

import { ActionForm, FormField, SubmitButton } from "@/components/form/action-form";
import { savePeriodLock } from "./lock-actions";

/**
 * Dönem kilidi kartı. Kilit tarihi ve öncesindeki borç, tahsilat, gider ve
 * kasa hareketi eklenemez/değiştirilemez (veritabanı tetikleyicisi).
 */
export function LockCard({ until, canWrite, untilLabel }: { until: string | null; canWrite: boolean; untilLabel: string | null }) {
  const t = useTranslations("app.periodLock");
  return (
    <Card className="mb-4">
      <CardHeader
        title={t("title")}
        description={until ? t("activeHint", { date: untilLabel ?? until }) : t("inactiveHint")}
        action={until ? <Lock aria-label={t("on")} className="h-5 w-5 text-warning-fg" /> : <LockOpen aria-label={t("off")} className="h-5 w-5 text-fg-subtle" />}
      />
      {canWrite ? (
        <CardBody>
          <ActionForm action={savePeriodLock} submitLabel={t("save")} stayOnSuccess footer={<div className="mt-3 flex justify-end"><SubmitButton label={t("save")} /></div>}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField name="until" label={t("until")} hint={t("untilHint")}>
                <Input name="until" type="date" defaultValue={until ?? ""} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField name="reason" label={t("reason")} required>
                  <Input name="reason" required minLength={5} maxLength={300} placeholder={t("reasonPlaceholder")} />
                </FormField>
              </div>
            </div>
          </ActionForm>
        </CardBody>
      ) : null}
    </Card>
  );
}
