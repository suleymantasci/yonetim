"use client";

import { Plus, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert, FormSection, Input, Modal, Select } from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import Link from "@/components/link";
import { saveExpenseCategory } from "./actions";

const DISTRIBUTIONS = ["equal", "land_share", "area", "person_count", "meter", "custom"] as const;

/**
 * "Gider kategorisi tanımlı değil" uyarısı + **tek adımda çözüm**.
 *
 * Uyarı yalnız sorunu söylemiyor, çözümü de sunuyor: "Kategori ekle" küçük bir
 * pencere açıyor (yalnız ad ve dağıtım yöntemi), kayıt bitince form olduğu
 * gibi kalıyor ve yeni kategori seçili geliyor.
 *
 * NEDEN ÜST ÜSTE ÇEKMECE DEĞİL: ikinci bir tam boy çekmece, kullanıcının
 * doldurduğu gider formunu gözden çıkarıyor ve telefonda iki ekran boyu katman
 * yığıyor. Ortalanmış küçük pencere "geçici bir yan iş" olduğunu söylüyor ve
 * arkadaki formun durumu (yazılan tutar, açıklama) hiç bozulmuyor.
 *
 * Tam kategori yönetimi (alt kategori, renk, KDV, sıra) ayrı ekranda;
 * "Kategorileri yönet" bağlantısı oraya götürüyor.
 */
export function NoCategoriesNotice({
  onCreated,
}: {
  /** Form içinde kullanılırsa yeni kategoriyi seçmek için. */
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations("app.expenses");
  const tEnum = useTranslations("enum");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);

  return (
    <>
      <Alert
        tone="warning"
        title={t("noCategoriesTitle")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("noCategoriesAdd")}
            </button>
            <Link
              href="/panel/giderler/kategoriler"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover"
            >
              <Settings2 aria-hidden className="h-4 w-4" />
              {t("noCategoriesManage")}
            </Link>
          </div>
        }
      >
        {t("noCategoriesBody")}
      </Alert>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("quickCategoryTitle")}
        description={t("quickCategoryHint")}
        closeLabel={tCommon("action.close")}
        size="md"
        padded={false}
      >
        <ActionForm
          action={saveExpenseCategory}
          submitLabel={tCommon("action.save")}
          layout="modal"
          onCancel={() => setOpen(false)}
          onSuccess={(state) => {
            setOpen(false);
            if (state.data?.id) onCreated?.(state.data.id);
          }}
        >
          {/* Hızlı formda sorulmayan alanların güvenli varsayılanları: kök
              kategori, ortak gider, aktif, standart KDV. Ayrıntı sonradan
              Kategoriler ekranında düzenlenir. */}
          <input type="hidden" name="isShared" value="on" />
          <input type="hidden" name="isActive" value="on" />
          <input type="hidden" name="sortOrder" value="0" />
          <input type="hidden" name="defaultVatRate" value="0,20" />

          <FormSection title={t("quickCategorySection")}>
            <div className="sm:col-span-2">
              <FormField name="name" label={t("categoryName")} required>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- modal açılışında odak beklenen davranış */}
                <Input name="name" required minLength={2} maxLength={120} autoFocus />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField
                name="distribution"
                label={t("distribution")}
                hint={t("distributionHint")}
                required
              >
                <Select name="distribution" defaultValue="equal" required>
                  {DISTRIBUTIONS.map((value) => (
                    <option key={value} value={value}>
                      {tEnum(`duesFormula.${value}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </FormSection>
        </ActionForm>
      </Modal>
    </>
  );
}
