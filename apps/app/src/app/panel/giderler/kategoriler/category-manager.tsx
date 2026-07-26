"use client";

import { ChevronRight, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  Alert, Badge, ConfirmDialog, Drawer, Input, Select, Switch, useToast,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { archiveExpenseCategory, saveExpenseCategory } from "../actions";

/**
 * Gider kategorisi yöneticisi — GAP 4.1.4 / 4.2.1.
 *
 * Bu ekran GAP'ın en somut boşluğunu kapatıyor: kategori eklenemediği için
 * gider kayıtları kategorisiz kalıyordu ve dağıtım formülü belirsizdi.
 *
 * Ağaç iki seviye: kök kategori (Personel Giderleri) → alt kategori (Kapıcı).
 * Alt kategoriye alt kategori eklenmesi sunucuda reddedilir; daha derin ağaç
 * "dağıtım formülü hangi seviyeden geliyor?" sorusunu belirsizleştiriyordu.
 */
export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  distribution: string;
  isShared: boolean;
  icon: string | null;
  color: string | null;
  defaultVatRate: string | null;
  isActive: boolean;
  sortOrder: number;
  expenseCount: number;
  total: string;
  children: CategoryNode[];
}

export function CategoryManager({
  tree,
  defaultColor,
  labels,
}: {
  tree: CategoryNode[];
  /**
   * Yeni kategori için başlangıç rengi. `<input type="color">` ham hex
   * istediği için token kullanılamıyor; değer marka konfigürasyonundan
   * (`siteConfig.design.colors.primary`) geliyor — yine tek kaynak.
   */
  defaultColor: string;
  labels: {
    newRoot: string;
    newChild: string;
    editTitle: string;
    formHint: string;
    name: string;
    parent: string;
    parentNone: string;
    distribution: string;
    distributionHint: string;
    distributionOptions: Record<string, string>;
    isShared: string;
    isSharedHint: string;
    icon: string;
    iconHint: string;
    color: string;
    vatRate: string;
    vatRateHint: string;
    isActive: string;
    isActiveHint: string;
    sortOrder: string;
    empty: string;
    expenseCount: string;
    archiveTitle: string;
    archiveDescription: string;
    archiveInUse: string;
    inactive: string;
  };
}) {
  const tCommon = useTranslations("common");
  const toast = useToast();
  const [editing, setEditing] = useState<CategoryNode | { parentId: string | null } | null>(null);
  const [archiving, setArchiving] = useState<CategoryNode | null>(null);
  const [pending, startTransition] = useTransition();

  const flatRoots = tree.map((node) => ({ id: node.id, name: node.name }));
  const isExisting = (value: unknown): value is CategoryNode =>
    typeof value === "object" && value !== null && "id" in value;
  const current = editing && isExisting(editing) ? editing : undefined;
  const presetParentId = editing && !isExisting(editing) ? editing.parentId : (current?.parentId ?? null);

  function confirmArchive() {
    if (!archiving) return;
    const target = archiving;
    startTransition(async () => {
      const result = await archiveExpenseCategory(target.id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setArchiving(null);
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setEditing({ parentId: null })}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {labels.newRoot}
        </button>
      </div>

      {tree.length === 0 ? (
        <Alert tone="info">{labels.empty}</Alert>
      ) : (
        <ul className="space-y-3">
          {tree.map((root) => (
            <li key={root.id} className="rounded-lg border border-border bg-surface">
              <CategoryRow
                node={root}
                labels={labels}
                onEdit={() => setEditing(root)}
                onAddChild={() => setEditing({ parentId: root.id })}
                onArchive={() => setArchiving(root)}
              />
              {root.children.length > 0 ? (
                <ul className="divide-y divide-border border-t border-border">
                  {root.children.map((child) => (
                    <li key={child.id} className="pl-6">
                      <CategoryRow
                        node={child}
                        labels={labels}
                        nested
                        onEdit={() => setEditing(child)}
                        onArchive={() => setArchiving(child)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? labels.editTitle : presetParentId ? labels.newChild : labels.newRoot}
        description={labels.formHint}
        closeLabel={tCommon("action.close")}
      >
        <ActionForm
          key={current?.id ?? `new-${presetParentId ?? "root"}`}
          action={saveExpenseCategory}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setEditing(null)}
          footer={null}
        >
          {current ? <input type="hidden" name="id" value={current.id} /> : null}

          <div className="space-y-4">
            <FormField name="name" label={labels.name} required>
              <Input name="name" defaultValue={current?.name} required minLength={2} maxLength={120} />
            </FormField>

            <FormField name="parentId" label={labels.parent}>
              <Select name="parentId" defaultValue={presetParentId ?? ""}>
                <option value="">{labels.parentNone}</option>
                {flatRoots
                  .filter((root) => root.id !== current?.id)
                  .map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.name}
                    </option>
                  ))}
              </Select>
            </FormField>

            <FormField
              name="distribution"
              label={labels.distribution}
              hint={labels.distributionHint}
              required
            >
              <Select name="distribution" defaultValue={current?.distribution ?? "equal"} required>
                {Object.entries(labels.distributionOptions).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="icon" label={labels.icon} hint={labels.iconHint}>
                <Input name="icon" defaultValue={current?.icon ?? ""} maxLength={40} placeholder="Wrench" />
              </FormField>
              <FormField name="color" label={labels.color}>
                <Input
                  name="color"
                  type="color"
                  defaultValue={current?.color ?? defaultColor}
                  className="h-10 p-1"
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="defaultVatRate" label={labels.vatRate} hint={labels.vatRateHint}>
                <Input
                  name="defaultVatRate"
                  inputMode="decimal"
                  defaultValue={current?.defaultVatRate ?? "0,20"}
                  placeholder="0,20"
                />
              </FormField>
              <FormField name="sortOrder" label={labels.sortOrder}>
                <Input
                  name="sortOrder"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  defaultValue={current?.sortOrder ?? 0}
                />
              </FormField>
            </div>

            <Switch
              name="isShared"
              label={labels.isShared}
              description={labels.isSharedHint}
              defaultChecked={current?.isShared ?? true}
            />
            <Switch
              name="isActive"
              label={labels.isActive}
              description={labels.isActiveHint}
              defaultChecked={current?.isActive ?? true}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
            >
              {tCommon("action.cancel")}
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              {tCommon("action.save")}
            </button>
          </div>
        </ActionForm>
      </Drawer>

      {archiving ? (
        <ConfirmDialog
          open
          onClose={() => setArchiving(null)}
          onConfirm={confirmArchive}
          title={labels.archiveTitle}
          description={
            archiving.expenseCount > 0 ? labels.archiveInUse : labels.archiveDescription
          }
          confirmLabel={tCommon("action.confirm")}
          cancelLabel={tCommon("action.cancel")}
          pending={pending}
        />
      ) : null}
    </>
  );
}

function CategoryRow({
  node,
  labels,
  nested,
  onEdit,
  onAddChild,
  onArchive,
}: {
  node: CategoryNode;
  labels: {
    distributionOptions: Record<string, string>;
    expenseCount: string;
    newChild: string;
    inactive: string;
  };
  nested?: boolean;
  onEdit: () => void;
  onAddChild?: () => void;
  onArchive: () => void;
}) {
  const tCommon = useTranslations("common");

  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      {nested ? (
        <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
      ) : null}
      <span
        aria-hidden
        className="h-3 w-3 shrink-0 rounded-sm border border-border"
        style={node.color ? { backgroundColor: node.color } : undefined}
      />
      <div className="min-w-0 flex-1">
        <span className={nested ? "text-sm text-fg" : "text-sm font-semibold text-fg"}>
          {node.name}
        </span>
        <span className="ml-2 text-xs text-fg-subtle">
          {labels.distributionOptions[node.distribution] ?? node.distribution}
        </span>
        {node.isActive ? null : (
          <Badge tone="neutral" className="ml-2">
            {labels.inactive}
          </Badge>
        )}
      </div>

      <span className="shrink-0 text-xs tabular-nums text-fg-muted">
        {node.expenseCount > 0 ? `${node.expenseCount} · ${node.total}` : "—"}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {onAddChild ? (
          <button
            type="button"
            onClick={onAddChild}
            aria-label={labels.newChild}
            title={labels.newChild}
            className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEdit}
          aria-label={tCommon("action.edit")}
          className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onArchive}
          aria-label={tCommon("action.delete")}
          className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger-fg"
        >
          {node.expenseCount > 0 ? (
            <Power aria-hidden className="h-3.5 w-3.5" />
          ) : (
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
