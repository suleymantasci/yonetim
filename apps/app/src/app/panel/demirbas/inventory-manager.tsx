"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUSES,
} from "@yonetim/contracts";
import {
  Badge,
  BulkActionBar,
  Card,
  CardBody,
  CardHeader,
  DateInput,
  Drawer,
  EmptyState,
  FormSection,
  Input,
  MoneyInput,
  Select,
  SelectCheckbox,
  Textarea,
  tableClasses as tc,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { saveInventoryItem, setInventoryStatus } from "./actions";

export interface InventoryRowView {
  id: string;
  code: string | null;
  name: string;
  category: string;
  categoryLabel: string;
  location: string | null;
  quantity: number;
  serialNo: string | null;
  purchaseDate: string | null;
  purchaseDateValue: string | null;
  purchasePriceKurus: number;
  purchasePrice: string;
  warrantyUntil: string | null;
  warrantyUntilValue: string | null;
  warrantyExpired: boolean;
  status: string;
  statusLabel: string;
  statusTone: "neutral" | "success" | "warning" | "danger";
  responsibleStaffId: string | null;
  responsibleStaffName: string | null;
  notes: string | null;
}

/**
 * Demirbaş defteri yönetimi — KMK md.34/9.
 *
 * ÜÇ KARAR:
 *
 * 1. **Silme yok, durum var.** Elden çıkan kalem `disposed`/`lost` işaretlenir,
 *    satır kalır. Devir teslimde sorulan soru "şu an ne var" değil, "geçen
 *    yıl olanlara ne oldu".
 *
 * 2. **`disposed` ile `lost` ayrı gösterilir.** İlki yönetimin kararıyla
 *    düşülen, ikincisi hesabı sorulacak bir eksik; ikisini tek "pasif"
 *    rozetinde toplamak devir teslimdeki asıl bilgiyi siler.
 *
 * 3. **Toplu durum değişikliği var, toplu silme yok.** Yıl sonu sayımı
 *    "şunlar kayıp" biçiminde toplu bir işlem; ama aynı kolaylık silme için
 *    sunulsaydı defter tek tıkla bozulabilirdi.
 */
export function InventoryManager({
  rows,
  staffOptions,
  emptyLabel,
}: {
  readonly rows: InventoryRowView[];
  readonly staffOptions: { id: string; name: string }[];
  readonly emptyLabel: string;
}) {
  const t = useTranslations("app.inventory");
  const tCommon = useTranslations("common");
  const tEnum = useTranslations("enum");

  const [editing, setEditing] = useState<InventoryRowView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  function openNew() {
    setEditing(null);
    setDrawerOpen(true);
  }

  function openEdit(row: InventoryRowView) {
    setEditing(row);
    setDrawerOpen(true);
  }

  function applyStatus(status: (typeof INVENTORY_STATUSES)[number]) {
    const ids = [...selected];
    setSelected([]);
    startTransition(async () => {
      await setInventoryStatus(ids, status);
    });
  }

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <>
      <Card>
        <CardHeader
          title={t("tableTitle")}
          description={t("tableHint")}
          action={
            <button
              type="button"
              onClick={openNew}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("newItem")}
            </button>
          }
        />
        <CardBody className="p-0">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title={t("emptyTitle")}
                description={t("emptyDescription")}
                steps={[t("emptyStep1"), t("emptyStep2"), t("emptyStep3")]}
              />
            </div>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table} style={{ minWidth: 900 }}>
                <thead className={tc.thead}>
                  <tr>
                    <th scope="col" className={`${tc.th} w-10`}>
                      <SelectCheckbox
                        checked={allSelected}
                        indeterminate={selected.length > 0}
                        onChange={(next) =>
                          setSelected(next ? rows.map((row) => row.id) : [])
                        }
                        label={tCommon("action.selectAll")}
                      />
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("code")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("name")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("category")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("location")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("quantity")}
                    </th>
                    <th scope="col" className={`${tc.th} text-right`}>
                      {t("purchasePrice")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("warranty")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("responsible")}
                    </th>
                    <th scope="col" className={tc.th}>
                      {t("status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={tc.tr}>
                      <td className={tc.td}>
                        <SelectCheckbox
                          checked={selected.includes(row.id)}
                          onChange={(next) =>
                            setSelected((prev) =>
                              next
                                ? [...prev, row.id]
                                : prev.filter((id) => id !== row.id),
                            )
                          }
                          label={t("selectRow", { name: row.name })}
                        />
                      </td>
                      <td className={`${tc.tdMuted} tabular-nums`}>
                        {row.code ?? "—"}
                      </td>
                      <td className={tc.td}>
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="font-medium text-fg hover:underline"
                        >
                          {row.name}
                        </button>
                        {row.serialNo ? (
                          <span className="block text-xs text-fg-subtle">
                            {t("serialNo")}: {row.serialNo}
                          </span>
                        ) : null}
                      </td>
                      <td className={tc.tdMuted}>{row.categoryLabel}</td>
                      <td className={tc.tdMuted}>{row.location ?? "—"}</td>
                      <td className={tc.tdNum}>{row.quantity}</td>
                      <td className={tc.tdNum}>{row.purchasePrice}</td>
                      <td className={tc.tdMuted}>
                        {row.warrantyUntil ? (
                          <span
                            className={
                              row.warrantyExpired ? "text-fg-subtle" : undefined
                            }
                          >
                            {row.warrantyUntil}
                            {row.warrantyExpired ? (
                              <span className="block text-xs">
                                {t("warrantyExpired")}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={tc.tdMuted}>
                        {row.responsibleStaffName ?? "—"}
                      </td>
                      <td className={tc.td}>
                        <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/*
        Toplu **durum** çubuğu; toplu silme bilinçli olarak yok (bkz. bileşen
        başlığı 3. madde). Sayım sonrası "şunlar kayıp" en sık yapılan işlem.
      */}
      <BulkActionBar
        selected={selected}
        onClear={() => setSelected([])}
        labels={{
          selected: t("selectedCount", { count: selected.length }),
          clear: tCommon("action.clear"),
        }}
      >
        {INVENTORY_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => applyStatus(status)}
            className="rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-sm font-medium text-fg hover:bg-hover"
          >
            {tEnum(`inventoryStatus.${status}`)}
          </button>
        ))}
      </BulkActionBar>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? t("editTitle") : t("newItem")}
        size="lg"
        closeLabel={tCommon("action.close")}
        /* `ActionForm layout="modal"` kendi kaydırma alanını ve alt barını
           kuruyor; gövde de dolgulu olsaydı iki kaydırma alanı iç içe geçip
           alt barın altında ikinci bir çubuk oluşurdu (bkz. `RouteDrawer`). */
        padded={false}
      >
        {/* `key`: çekmece farklı bir kayıtla açıldığında form alanları
            sıfırlansın — kontrolsüz alanlar aksi halde önceki değeri tutar. */}
        <ActionForm
          key={editing?.id ?? "new"}
          action={saveInventoryItem}
          submitLabel={tCommon("action.save")}
          layout="modal"
          stayOnSuccess
          onCancel={() => setDrawerOpen(false)}
          onSuccess={() => setDrawerOpen(false)}
        >
          {editing ? (
            <input type="hidden" name="id" value={editing.id} />
          ) : null}

          <FormSection title={t("sectionBasics")}>
            <FormField name="name" label={t("name")} required>
              <Input
                name="name"
                defaultValue={editing?.name ?? ""}
                required
                minLength={2}
                maxLength={160}
              />
            </FormField>
            <FormField name="code" label={t("code")} hint={t("codeHint")}>
              <Input
                name="code"
                defaultValue={editing?.code ?? ""}
                maxLength={40}
              />
            </FormField>
            <FormField name="category" label={t("category")} required>
              <Select
                name="category"
                defaultValue={editing?.category ?? "other"}
                required
              >
                {INVENTORY_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {tEnum(`inventoryCategory.${value}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField name="status" label={t("status")} required>
              <Select
                name="status"
                defaultValue={editing?.status ?? "active"}
                required
              >
                {INVENTORY_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {tEnum(`inventoryStatus.${value}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              name="location"
              label={t("location")}
              hint={t("locationHint")}
            >
              <Input
                name="location"
                defaultValue={editing?.location ?? ""}
                maxLength={120}
              />
            </FormField>
            <FormField
              name="quantity"
              label={t("quantity")}
              hint={t("quantityHint")}
            >
              <Input
                name="quantity"
                type="number"
                min={1}
                max={100000}
                defaultValue={String(editing?.quantity ?? 1)}
              />
            </FormField>
          </FormSection>

          <FormSection title={t("sectionPurchase")}>
            <FormField name="serialNo" label={t("serialNo")}>
              <Input
                name="serialNo"
                defaultValue={editing?.serialNo ?? ""}
                maxLength={80}
              />
            </FormField>
            <FormField name="purchaseDate" label={t("purchaseDate")}>
              <DateInput
                name="purchaseDate"
                defaultValue={editing?.purchaseDateValue ?? ""}
              />
            </FormField>
            <FormField
              name="purchasePriceKurus"
              label={t("purchasePrice")}
              hint={t("purchasePriceHint")}
            >
              <MoneyInput
                name="purchasePriceKurus"
                defaultKurus={editing?.purchasePriceKurus ?? 0}
              />
            </FormField>
            <FormField name="warrantyUntil" label={t("warranty")}>
              <DateInput
                name="warrantyUntil"
                defaultValue={editing?.warrantyUntilValue ?? ""}
              />
            </FormField>
          </FormSection>

          <FormSection title={t("sectionAssignment")} columns={1}>
            <FormField
              name="responsibleStaffId"
              label={t("responsible")}
              hint={t("responsibleHint")}
            >
              <Select
                name="responsibleStaffId"
                defaultValue={editing?.responsibleStaffId ?? ""}
              >
                <option value="">{emptyLabel}</option>
                {staffOptions.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField name="notes" label={t("notes")}>
              <Textarea
                name="notes"
                defaultValue={editing?.notes ?? ""}
                rows={3}
                maxLength={1000}
              />
            </FormField>
          </FormSection>
        </ActionForm>
      </Drawer>
    </>
  );
}
