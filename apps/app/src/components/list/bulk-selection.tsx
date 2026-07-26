"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { BulkActionBar, ConfirmDialog, SelectCheckbox, useToast } from "@yonetim/ui";

/**
 * Toplu seçim + aksiyon çubuğu — GAP 4.2.6 / 4.3.1.
 *
 * ATOMİKLİK: aksiyonlar Server Action'a **tek çağrıda** kimlik listesiyle gider;
 * sunucu tarafı işi tek transaction içinde yapar. İstemciden N ayrı çağrı
 * atmak yarım kalmış toplu işlem üretirdi (10 sildi, 11.'de hata).
 *
 * Seçim sayfa değişince sıfırlanır — kullanıcının görmediği satırı silmesini
 * engellemek bilinçli bir karar; "tüm sonuçları seç" ayrı ve açık bir işlem
 * olmalı (şu an desteklenmiyor).
 */
export function BulkSelection<T extends { id: string }>({
  rows,
  children,
  actions,
}: {
  rows: T[];
  /** Satır render'ı: seçim kutusu ve seçili durum enjekte edilir. */
  children: (helpers: {
    isSelected: (id: string) => boolean;
    toggle: (id: string) => void;
    headerCheckbox: ReactNode;
    rowCheckbox: (id: string) => ReactNode;
  }) => ReactNode;
  /** Aksiyon tanımları; `run` seçili kimlikleri alır. */
  actions: {
    key: string;
    label: string;
    tone?: "primary" | "danger";
    /** Yıkıcı işlemde onay diyaloğu metni. */
    confirm?: { title: string; description: string; confirmLabel: string };
    run: (ids: string[]) => Promise<{ ok: boolean; message: string }>;
  }[];
}) {
  const t = useTranslations("common");
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = ids.length > 0 && selected.length === ids.length;

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  function run(actionKey: string) {
    const action = actions.find((a) => a.key === actionKey);
    if (!action) return;
    const targets = [...selected];
    startTransition(async () => {
      const result = await action.run(targets);
      if (result.ok) {
        toast.success(result.message);
        setSelected([]);
      } else {
        toast.error(result.message);
      }
      setConfirming(null);
    });
  }

  const pendingAction = actions.find((a) => a.key === confirming);

  return (
    <>
      {children({
        isSelected: (id) => selected.includes(id),
        toggle,
        headerCheckbox: (
          <SelectCheckbox
            checked={allSelected}
            indeterminate={selected.length > 0}
            onChange={(next) => setSelected(next ? ids : [])}
            label={t("action.selectAll")}
          />
        ),
        rowCheckbox: (id) => (
          <SelectCheckbox
            checked={selected.includes(id)}
            onChange={() => toggle(id)}
            label={t("a11y.rowSelect")}
          />
        ),
      })}

      <BulkActionBar
        selected={selected}
        onClear={() => setSelected([])}
        labels={{
          selected: t("state.selectedCount", { count: selected.length }),
          clear: t("action.clearSelection"),
        }}
      >
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={pending}
            onClick={() => (action.confirm ? setConfirming(action.key) : run(action.key))}
            className={
              action.tone === "danger"
                ? "inline-flex h-9 items-center rounded-lg bg-danger px-3 text-sm font-semibold text-primary-fg hover:brightness-95 disabled:opacity-50"
                : "inline-flex h-9 items-center rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-50"
            }
          >
            {action.label}
          </button>
        ))}
      </BulkActionBar>

      {pendingAction?.confirm ? (
        <ConfirmDialog
          open
          onClose={() => setConfirming(null)}
          onConfirm={() => run(pendingAction.key)}
          title={pendingAction.confirm.title}
          description={pendingAction.confirm.description}
          confirmLabel={pendingAction.confirm.confirmLabel}
          cancelLabel={t("action.cancel")}
          tone={pendingAction.tone === "danger" ? "danger" : "primary"}
          pending={pending}
        />
      ) : null}
    </>
  );
}
