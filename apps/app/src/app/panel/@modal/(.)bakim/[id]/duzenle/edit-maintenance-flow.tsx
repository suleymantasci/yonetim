"use client";

import { useState, type ReactNode } from "react";

import { CompleteMaintenanceForm } from "../../../../bakim/complete-maintenance-form";
import type { MaintenanceFormDefaults } from "../../../../bakim/maintenance-form";
import {
  MaintenanceForm,
  type MaintenanceTemplateOption,
} from "../../../../bakim/maintenance-form";
import { useRouteDrawerClose } from "@/components/route-drawer";

/**
 * Çekmecede iki iş var ve **aynı anda ikisi de görünmüyor**: planı düzenlemek
 * ve "yapıldı" işaretlemek. Üçüncü sekme salt okunur geçmiş: "yapıldı"
 * kayıtları önceden hiçbir yerde listelenmiyordu. Tam sayfa sürümde yan yana iki kart olarak
 * duruyorlar; çekmecenin dar alanında üst üste yığmak, kullanıcının hangi
 * formu gönderdiğini belirsizleştirirdi.
 *
 * Ayrım basit bir seçici ile: `Tabs` bileşeni proje içinde henüz Radix'e
 * taşınmadığı ve burada tek kullanım olduğu için iki düğme yeterli.
 */
export function EditMaintenanceFlow({
  defaults,
  templates,
  intervalDays,
  history,
  labels,
}: {
  defaults: MaintenanceFormDefaults;
  templates: MaintenanceTemplateOption[];
  intervalDays: number;
  /** Sunucuda çizilmiş geçmiş listesi (`MaintenanceHistory`). */
  history: ReactNode;
  labels: {
    save: string;
    markDone: string;
    editTab: string;
    completeTab: string;
    historyTab: string;
  };
}) {
  const close = useRouteDrawerClose();
  const [mode, setMode] = useState<"edit" | "complete" | "history">("edit");

  return (
    <>
      <div
        role="tablist"
        aria-label={labels.editTab}
        className="flex gap-2 border-b border-border px-5 pt-4 sm:px-6"
      >
        {(
          [
            ["edit", labels.editTab],
            ["complete", labels.completeTab],
            ["history", labels.historyTab],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              mode === value
                ? "border-primary text-fg"
                : "border-transparent text-fg-subtle hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "edit" ? (
        <MaintenanceForm
          defaults={defaults}
          templates={templates}
          submitLabel={labels.save}
          layout="modal"
          onCancel={close}
          stayOnSuccess
          onSaved={close}
        />
      ) : mode === "history" ? (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6">{history}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-5 sm:p-6">
          <CompleteMaintenanceForm
            recordId={defaults.id}
            intervalDays={intervalDays}
            submitLabel={labels.markDone}
            onDone={close}
          />
        </div>
      )}
    </>
  );
}
