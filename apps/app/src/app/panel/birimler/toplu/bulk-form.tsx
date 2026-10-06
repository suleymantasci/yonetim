"use client";

import Link from "@/components/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Alert,
  Combobox,
  FormSection,
  Input,
  RadioGroup,
  Select,
  StickyFormBar,
} from "@yonetim/ui";

import {
  ActionForm,
  FormField,
  SubmitButton,
} from "@/components/form/action-form";
import { createUnitsBulk, type BulkStep } from "../actions";

/**
 * Toplu birim üretim sihirbazı — GAP 4.1.1 + GAP-DURUM kararı 8.
 *
 * **İki adım:** yönetici önce "A-101, A-102 …" listesini görür, sonra onaylar.
 * Numaralandırma kalıbını yanlış kurup 120 daire açmak, sonra tek tek silmek
 * zorunda kalmak en olası hata senaryosuydu.
 *
 * Önizleme **sunucuda** üretiliyor ve yazma ile aynı fonksiyonu kullanıyor;
 * gösterilen liste ile kaydedilen liste ayrışamaz. Daha önce bu hesap istemcide
 * bir kez daha yazılmıştı — iki kopya, ve zaten var olan numaraları göremeyen
 * bir önizleme. Kural artık protokolde de var: onaysız yazma isteğine API
 * `preview_required` döndürüyor.
 *
 * Aşağıdaki canlı kalıp örneği (ilk birkaç numara) yalnız bir yazım
 * yardımcısıdır ve bağlayıcı değildir; bağlayıcı liste onay adımında gelir.
 */
export function BulkUnitForm({
  blocks,
  cancelHref,
}: {
  blocks: { id: string; name: string }[];
  cancelHref: string;
}) {
  const t = useTranslations("app.units");
  const tCommon = useTranslations("common");
  const tEnum = useTranslations("enum");

  const [blockId] = useState("");
  const [newBlockName, setNewBlockName] = useState("");
  const [floorFrom, setFloorFrom] = useState(1);
  const [floorTo, setFloorTo] = useState(4);
  const [perFloor, setPerFloor] = useState(4);
  const [pattern, setPattern] = useState("{blok}-{no}");
  const [numbering, setNumbering] = useState<"sequential" | "floorPrefixed">(
    "floorPrefixed",
  );

  const blockName = blockId
    ? (blocks.find((b) => b.id === blockId)?.name ?? "")
    : newBlockName;
  const floorCount = Math.max(0, floorTo - floorFrom + 1);
  const total = floorCount * perFloor;

  const patternSample: string[] = [];
  for (
    let floor = floorFrom;
    floor <= floorTo && patternSample.length < 6;
    floor += 1
  ) {
    for (
      let index = 1;
      index <= perFloor && patternSample.length < 6;
      index += 1
    ) {
      const sequence =
        numbering === "floorPrefixed"
          ? `${floor}${String(index).padStart(2, "0")}`
          : String((floor - floorFrom) * perFloor + index);
      patternSample.push(
        pattern
          .replaceAll("{blok}", blockName || "?")
          .replaceAll("{kat}", String(floor))
          .replaceAll("{no}", sequence)
          .slice(0, 20),
      );
    }
  }

  return (
    <ActionForm<BulkStep>
      action={createUnitsBulk}
      submitLabel={t("bulkSubmit", { count: total })}
      cancelHref={cancelHref}
      inlineSuccess
      footer={(state) => {
        const step = state.status === "ok" ? state.data : undefined;
        const ready = step?.kind === "preview" ? step.preview : null;
        return (
          // Elle yazılmış kopya yerine `StickyFormBar`: kopyadaki `sm:-mx-6`,
          // `CardBody`'nin `p-4` dolgusundan taşıp sayfanın altına yatay
          // kaydırma çubuğu koyuyordu.
          <StickyFormBar>
            <Link
              href={cancelHref}
              className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg transition-colors hover:bg-hover"
            >
              {tCommon("action.cancel")}
            </Link>
            {/* Önizleme adımı: onaysız gönderim yazmaz, listeyi getirir. */}
            <SubmitButton
              label={ready ? t("bulkEdit") : t("preview")}
              variant={ready ? "outline" : "primary"}
            />
            {ready ? (
              <SubmitButton
                name="confirmed"
                value="1"
                label={t("bulkConfirm", { count: ready.total })}
              />
            ) : null}
          </StickyFormBar>
        );
      }}
    >
      {(state) => (
        <>
          <FormSection
            title={t("bulkSectionBlock")}
            description={t("bulkSectionBlockHint")}
          >
            <FormField name="blockId" label={t("existingBlock")}>
              <Combobox
                name="blockId"
                options={blocks.map((block) => ({
                  value: block.id,
                  label: block.name,
                }))}
                defaultValues={[]}
                placeholder={t("createNewBlock")}
                searchPlaceholder={t("searchBlock")}
                emptyText={t("noBlockFound")}
              />
            </FormField>

            <FormField
              name="newBlockName"
              label={t("newBlockName")}
              hint={t("newBlockNameHint")}
            >
              <Input
                name="newBlockName"
                value={newBlockName}
                onChange={(event) => setNewBlockName(event.target.value)}
                placeholder="A"
                maxLength={60}
                disabled={blockId !== ""}
              />
            </FormField>
          </FormSection>

          <FormSection
            title={t("bulkSectionLayout")}
            description={t("bulkSectionLayoutHint")}
            columns={3}
          >
            <FormField name="floorFrom" label={t("floorFrom")} required>
              <Input
                name="floorFrom"
                type="number"
                inputMode="numeric"
                value={floorFrom}
                onChange={(event) => setFloorFrom(Number(event.target.value))}
                min={-5}
                max={200}
                required
              />
            </FormField>
            <FormField name="floorTo" label={t("floorTo")} required>
              <Input
                name="floorTo"
                type="number"
                inputMode="numeric"
                value={floorTo}
                onChange={(event) => setFloorTo(Number(event.target.value))}
                min={-5}
                max={200}
                required
              />
            </FormField>
            <FormField name="perFloor" label={t("perFloor")} required>
              <Input
                name="perFloor"
                type="number"
                inputMode="numeric"
                value={perFloor}
                onChange={(event) => setPerFloor(Number(event.target.value))}
                min={1}
                max={40}
                required
              />
            </FormField>
          </FormSection>

          <FormSection
            title={t("bulkSectionNumbering")}
            description={t("bulkSectionNumberingHint")}
            columns={1}
          >
            <RadioGroup
              name="numbering"
              columns={2}
              defaultValue={numbering}
              onChange={(value) =>
                setNumbering(value as "sequential" | "floorPrefixed")
              }
              options={[
                {
                  value: "floorPrefixed",
                  label: t("numberingFloorPrefixed"),
                  description: t("numberingFloorPrefixedHint"),
                },
                {
                  value: "sequential",
                  label: t("numberingSequential"),
                  description: t("numberingSequentialHint"),
                },
              ]}
            />

            <FormField
              name="pattern"
              label={t("pattern")}
              hint={t("patternHint")}
              required
            >
              <Input
                name="pattern"
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
                maxLength={40}
                required
              />
            </FormField>

            <div className="rounded-lg border border-border bg-surface-sunken p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {t("preview")}
              </p>
              <p className="mt-1.5 font-mono text-sm text-fg">
                {patternSample.join(" · ")}
                {total > patternSample.length
                  ? ` … (+${total - patternSample.length})`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-fg-muted">
                {t("previewTotal", { count: total })}
              </p>
            </div>

            {total > 500 ? (
              <Alert tone="danger">{t("bulkTooMany", { max: 500 })}</Alert>
            ) : total === 0 ? (
              <Alert tone="warning">{t("floorRangeInvalid")}</Alert>
            ) : null}
          </FormSection>

          <FormSection
            title={t("bulkSectionDefaults")}
            description={t("bulkSectionDefaultsHint")}
          >
            <FormField name="type" label={t("type")} required>
              <Select name="type" defaultValue="flat" required>
                {(
                  [
                    "flat",
                    "shop",
                    "office",
                    "depot",
                    "garage",
                    "villa",
                  ] as const
                ).map((type) => (
                  <option key={type} value={type}>
                    {tEnum(`unitType.${type}`)}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField name="areaM2" label={t("area")} hint={t("bulkAreaHint")}>
              <Input name="areaM2" inputMode="decimal" placeholder="72,50" />
            </FormField>

            <FormField
              name="landShareDenominator"
              label={t("shareDenominator")}
              hint={t("bulkShareHint")}
            >
              <Input
                name="landShareDenominator"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="1000"
              />
            </FormField>
          </FormSection>

          {state.status === "ok" && state.data?.kind === "preview" ? (
            <BulkPreviewPanel
              preview={state.data.preview}
              labels={{
                title: t("bulkPreviewTitle"),
                hint: t("bulkPreviewHint"),
                skipped: (list: string) => t("bulkPreviewSkipped", { list }),
              }}
            />
          ) : null}
        </>
      )}
    </ActionForm>
  );
}

/**
 * Sunucudan gelen numara listesi. Uzun listelerde ilk 60 numara gösterilip
 * gerisi sayılıyor: 500 numarayı ekrana basmak onayı kolaylaştırmıyor,
 * zorlaştırıyor.
 */
function BulkPreviewPanel({
  preview,
  labels,
}: {
  preview: { numbers: string[]; skipped: string[]; total: number };
  labels: { title: string; hint: string; skipped: (list: string) => string };
}) {
  const shown = preview.numbers.slice(0, 60);
  const rest = preview.numbers.length - shown.length;

  return (
    <div className="mt-4 rounded-lg border border-primary bg-primary-soft p-4">
      <p className="text-sm font-semibold text-fg">{labels.title}</p>
      <p className="mt-1 text-xs text-fg-muted">{labels.hint}</p>
      <p className="mt-2 font-mono text-sm leading-6 text-fg">
        {shown.join(" · ")}
        {rest > 0 ? ` … (+${rest})` : ""}
      </p>
      {preview.skipped.length > 0 ? (
        <p className="mt-2 text-xs text-warning-fg">
          {labels.skipped(preview.skipped.slice(0, 20).join(", "))}
        </p>
      ) : null}
    </div>
  );
}
