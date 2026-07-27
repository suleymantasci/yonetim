"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  Badge,
  ConfirmDialog,
  Drawer,
  Input,
  Switch,
  tableClasses as tc,
  useToast,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveBlock, softDeleteBlock } from "../actions";

/**
 * Blok yönetimi — GAP 4.3.1 ("iç içe CRUD": sayfadan çıkmadan kayıt ekleme).
 *
 * Ekleme/düzenleme drawer içinde açılır: yönetici blok listesini kaybetmeden
 * arka arkaya birkaç blok tanımlayabilir. Silme, içinde birim varsa sunucu
 * tarafında engellenir; buradaki onay diyaloğu yalnız niyet teyidi.
 */
export interface BlockRow {
  id: string;
  name: string;
  floorCount: number;
  unitCount: number;
  hasElevator: boolean;
  sortOrder: number;
}

export function BlocksManager({ blocks }: { blocks: BlockRow[] }) {
  const t = useTranslations("app.units");
  const tCommon = useTranslations("common");
  const toast = useToast();
  const [editing, setEditing] = useState<BlockRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<BlockRow | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const result = await softDeleteBlock(target.id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      setDeleting(null);
    });
  }

  const current = editing === "new" ? undefined : (editing ?? undefined);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
        >
          <Plus aria-hidden className="h-4 w-4" />
          {t("newBlock")}
        </button>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className={tc.wrapper}>
          <table className={tc.table}>
            <thead className={tc.thead}>
              <tr>
                <th scope="col" className={tc.th}>
                  {t("blockName")}
                </th>
                <th scope="col" className={`${tc.th} text-right`}>
                  {t("floorCount")}
                </th>
                <th scope="col" className={`${tc.th} text-right`}>
                  {t("unitCount")}
                </th>
                <th scope="col" className={tc.th}>
                  {t("elevator")}
                </th>
                <th scope="col" className={`${tc.th} text-right`}>
                  {t("sortOrder")}
                </th>
                <th scope="col" className="w-20 px-4 py-2">
                  <span className="sr-only">{tCommon("action.edit")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {blocks.length === 0 ? (
                <tr>
                  <td colSpan={6} className={tc.empty}>
                    {t("noBlocks")}
                  </td>
                </tr>
              ) : (
                blocks.map((block) => (
                  <tr key={block.id} className={tc.tr}>
                    <td className={`${tc.td} font-medium`}>{block.name}</td>
                    <td className={tc.tdNum}>{block.floorCount}</td>
                    <td className={tc.tdNum}>{block.unitCount}</td>
                    <td className={tc.td}>
                      {block.hasElevator ? (
                        <Badge tone="success">{tCommon("state.yes")}</Badge>
                      ) : (
                        <Badge tone="neutral">{tCommon("state.no")}</Badge>
                      )}
                    </td>
                    <td className={tc.tdNum}>{block.sortOrder}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(block)}
                          aria-label={tCommon("action.edit")}
                          className="rounded p-1 text-fg-subtle hover:bg-hover hover:text-fg"
                        >
                          <Pencil aria-hidden className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(block)}
                          aria-label={tCommon("action.delete")}
                          className="rounded p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger-fg"
                        >
                          <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={current ? t("editBlock", { name: current.name }) : t("newBlock")}
        description={t("blockFormHint")}
        closeLabel={tCommon("action.close")}
        size="md"
      >
        {/* `key` ile form sıfırdan kurulur: farklı bloğa geçince eski değerler kalmaz. */}
        <ActionForm
          key={current?.id ?? "new"}
          action={saveBlock}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setEditing(null)}
          footer={null}
        >
          {current ? (
            <input type="hidden" name="id" value={current.id} />
          ) : null}

          <div className="space-y-4">
            <FormField name="name" label={t("blockName")} required>
              <Input
                name="name"
                defaultValue={current?.name}
                required
                maxLength={60}
              />
            </FormField>
            <FormField name="floorCount" label={t("floorCount")} required>
              <Input
                name="floorCount"
                type="number"
                inputMode="numeric"
                min={1}
                max={200}
                defaultValue={current?.floorCount ?? 1}
                required
              />
            </FormField>
            <FormField
              name="sortOrder"
              label={t("sortOrder")}
              hint={t("sortOrderHint")}
            >
              <Input
                name="sortOrder"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                defaultValue={current?.sortOrder ?? 0}
              />
            </FormField>
            <Switch
              name="hasElevator"
              label={t("elevator")}
              defaultChecked={current?.hasElevator}
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

      {deleting ? (
        <ConfirmDialog
          open
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
          title={t("deleteBlockTitle", { name: deleting.name })}
          description={t("deleteBlockDescription")}
          confirmLabel={tCommon("action.delete")}
          cancelLabel={tCommon("action.cancel")}
          pending={pending}
        />
      ) : null}
    </>
  );
}
