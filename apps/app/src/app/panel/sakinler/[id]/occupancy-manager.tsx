"use client";

import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  Alert, Badge, Combobox, DateInput, Drawer, Input, Select, tableClasses as tc, Textarea,
} from "@yonetim/ui";

import { ActionForm, FormField } from "@/components/form/action-form";
import { addOccupancy, endOccupancy } from "../actions";

/**
 * Sakinin birim ilişkileri — ekleme ve **ayrılma** akışı.
 *
 * Ayrılma (kiracı çıkışı) drawer içinde sorulur çünkü tek bir tarih alanı
 * değil, bir **karar**: kalan borç kime geçecek? Politika seçenekleri ve her
 * birinin sonucu formda açıkça yazılı — sunucudaki devir motoru bu seçime göre
 * borçların yükümlüsünü değiştirir (GAP 4.2.4).
 */
export interface OccupancyView {
  occupancyId: string;
  unitId: string;
  unitLabel: string;
  relation: string;
  relationLabel: string;
  ownershipPct: string;
  startDate: string;
  endDate: string | null;
  policyLabel: string;
  contractUrl: string | null;
  /** Bu birimde bu kişinin açık bakiyesi — ayrılma kararında kritik. */
  outstanding: string;
  hasOutstanding: boolean;
}

export function OccupancyManager({
  userId,
  occupancies,
  units,
  labels,
}: {
  userId: string;
  occupancies: OccupancyView[];
  units: { id: string; number: string; blockName: string | null }[];
  labels: {
    title: string;
    hint: string;
    unit: string;
    relation: string;
    relationOwner: string;
    relationTenant: string;
    sharePct: string;
    startDate: string;
    endDate: string;
    policy: string;
    ongoing: string;
    empty: string;
    addTitle: string;
    addHint: string;
    endTitle: string;
    endHint: string;
    endAction: string;
    outstandingWarning: string;
    transferLabel: string;
    transferHint: string;
    transferOwner: string;
    transferNextTenant: string;
    transferKeep: string;
    reason: string;
    reasonHint: string;
    ownershipPct: string;
    ownershipPctHint: string;
    selectUnit: string;
    searchUnit: string;
    noUnitFound: string;
    outstanding: string;
    contract: string;
  };
}) {
  const tCommon = useTranslations("common");
  const [adding, setAdding] = useState(false);
  const [ending, setEnding] = useState<OccupancyView | null>(null);

  const unitOptions = units.map((unit) => ({
    value: unit.id,
    label: unit.blockName ? `${unit.blockName} / ${unit.number}` : unit.number,
  }));

  return (
    <>
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h3 className="text-base font-semibold text-fg">{labels.title}</h3>
            <p className="mt-0.5 text-sm text-fg-muted">{labels.hint}</p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Plus aria-hidden className="h-4 w-4" />
            {labels.addTitle}
          </button>
        </div>

        <div className={tc.wrapper}>
          <table className={tc.table} style={{ minWidth: 780 }}>
            <thead className={tc.thead}>
              <tr>
                <th scope="col" className={tc.th}>{labels.unit}</th>
                <th scope="col" className={tc.th}>{labels.relation}</th>
                <th scope="col" className={`${tc.th} text-right`}>{labels.sharePct}</th>
                <th scope="col" className={`${tc.th} text-right`}>{labels.outstanding}</th>
                <th scope="col" className={tc.th}>{labels.startDate}</th>
                <th scope="col" className={tc.th}>{labels.endDate}</th>
                <th scope="col" className={tc.th}>{labels.policy}</th>
                <th scope="col" className="w-24 px-4 py-2">
                  <span className="sr-only">{labels.endAction}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {occupancies.length === 0 ? (
                <tr>
                  <td colSpan={8} className={tc.empty}>
                    {labels.empty}
                  </td>
                </tr>
              ) : (
                occupancies.map((occupancy) => (
                  <tr key={occupancy.occupancyId} className={tc.tr}>
                    <td className={`${tc.td} font-medium`}>
                      <Link
                        href={`/panel/birimler/${occupancy.unitId}`}
                        className="hover:underline"
                      >
                        {occupancy.unitLabel}
                      </Link>
                    </td>
                    <td className={tc.td}>
                      <Badge tone={occupancy.relation === "owner" ? "brand" : "info"}>
                        {occupancy.relationLabel}
                      </Badge>
                    </td>
                    <td className={tc.tdNum}>{occupancy.ownershipPct}</td>
                    <td
                      className={`${tc.tdNum} ${occupancy.hasOutstanding ? "font-semibold text-danger-fg" : ""}`}
                    >
                      {occupancy.outstanding}
                    </td>
                    <td className={tc.td}>{occupancy.startDate}</td>
                    <td className={tc.tdMuted}>{occupancy.endDate ?? labels.ongoing}</td>
                    <td className={tc.tdMuted}>{occupancy.policyLabel}</td>
                    <td className="px-4 py-2.5 text-right">
                      {occupancy.endDate ? null : (
                        <button
                          type="button"
                          onClick={() => setEnding(occupancy)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-2 py-1 text-xs font-medium text-fg hover:bg-hover"
                        >
                          <LogOut aria-hidden className="h-3 w-3" />
                          {labels.endAction}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        open={adding}
        onClose={() => setAdding(false)}
        title={labels.addTitle}
        description={labels.addHint}
        closeLabel={tCommon("action.close")}
      >
        <ActionForm
          action={addOccupancy}
          submitLabel={tCommon("action.save")}
          onSuccess={() => setAdding(false)}
          footer={null}
        >
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-4">
            <FormField name="unitId" label={labels.unit} required>
              <Combobox
                name="unitId"
                options={unitOptions}
                placeholder={labels.selectUnit}
                searchPlaceholder={labels.searchUnit}
                emptyText={labels.noUnitFound}
              />
            </FormField>
            <FormField name="relation" label={labels.relation} required>
              <Select name="relation" defaultValue="owner" required>
                <option value="owner">{labels.relationOwner}</option>
                <option value="tenant">{labels.relationTenant}</option>
              </Select>
            </FormField>
            <FormField
              name="ownershipPct"
              label={labels.ownershipPct}
              hint={labels.ownershipPctHint}
            >
              <Input name="ownershipPct" inputMode="decimal" defaultValue="100" />
            </FormField>
            <FormField name="startDate" label={labels.startDate} required>
              <DateInput name="startDate" defaultValue={today()} required />
            </FormField>
            <FormField name="debtTransferPolicy" label={labels.policy} hint={labels.transferHint}>
              <Select name="debtTransferPolicy" defaultValue="owner">
                <option value="owner">{labels.transferOwner}</option>
                <option value="next_tenant">{labels.transferNextTenant}</option>
                <option value="keep">{labels.transferKeep}</option>
              </Select>
            </FormField>
            <FormField name="contractUrl" label={labels.contract}>
              <Input name="contractUrl" type="url" placeholder="https://…" maxLength={500} />
            </FormField>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
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

      <Drawer
        open={ending !== null}
        onClose={() => setEnding(null)}
        title={labels.endTitle}
        description={labels.endHint}
        closeLabel={tCommon("action.close")}
      >
        {ending ? (
          <ActionForm
            key={ending.occupancyId}
            action={endOccupancy}
            submitLabel={labels.endAction}
            onSuccess={() => setEnding(null)}
            footer={null}
          >
            <input type="hidden" name="occupancyId" value={ending.occupancyId} />

            <div className="space-y-4">
              <div className="rounded-lg bg-surface-sunken p-3 text-sm">
                <span className="font-semibold text-fg">{ending.unitLabel}</span>
                <span className="ml-2 text-fg-muted">{ending.relationLabel}</span>
              </div>

              {ending.hasOutstanding ? (
                <Alert tone="warning" title={ending.outstanding}>
                  {labels.outstandingWarning}
                </Alert>
              ) : null}

              <FormField name="endDate" label={labels.endDate} required>
                <DateInput name="endDate" defaultValue={today()} required />
              </FormField>

              <FormField name="transferTo" label={labels.transferLabel} hint={labels.transferHint} required>
                <Select name="transferTo" defaultValue="owner" required>
                  <option value="owner">{labels.transferOwner}</option>
                  <option value="next_tenant">{labels.transferNextTenant}</option>
                  <option value="keep">{labels.transferKeep}</option>
                </Select>
              </FormField>

              <FormField name="reason" label={labels.reason} hint={labels.reasonHint}>
                <Textarea name="reason" rows={2} maxLength={500} />
              </FormField>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnding(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
              >
                {tCommon("action.cancel")}
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
              >
                {labels.endAction}
              </button>
            </div>
          </ActionForm>
        ) : null}
      </Drawer>
    </>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
