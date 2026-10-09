"use client";

import { Car, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { HOUSEHOLD_RELATIONS, type UnitExtras } from "@yonetim/contracts";
import { Card, CardBody, CardHeader, Input, Select, useToast } from "@yonetim/ui";

import { ActionForm, FormField, SubmitButton } from "@/components/form/action-form";
import { addHouseholdMember, addVehicle, removeHouseholdMember, removeVehicle } from "../extras-actions";

/**
 * Daire kartı: hane halkı (panel kullanıcısı olmayan, dairede yaşayanlar)
 * ve araç plakaları. Ekleme satır içi; her blok kendi küçük formunda.
 */
export function UnitExtrasCard({
  unitId,
  extras,
  canWriteHousehold,
  canWriteVehicles,
}: {
  unitId: string;
  extras: UnitExtras;
  canWriteHousehold: boolean;
  canWriteVehicles: boolean;
}) {
  const t = useTranslations("app.units.extras");
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const remove = (task: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const r = await task();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      router.refresh();
    });

  const inlineBar = (label: string) => (
    <div className="mt-3 flex justify-end">
      <SubmitButton label={label} />
    </div>
  );

  return (
    <Card className="lg:col-span-2">
      <CardHeader title={t("title")} description={t("hint")} />
      <CardBody className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section aria-labelledby="household-title">
          <h4 id="household-title" className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users aria-hidden className="h-4 w-4" />
            {t("household", { count: extras.household.length })}
          </h4>
          {extras.household.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("householdEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {extras.household.map((h) => (
                <li key={h.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{h.fullName}</span>
                    <span className="block text-xs text-fg-subtle">
                      {[t(`relation.${h.relation}`), h.birthYear, h.phone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {canWriteHousehold ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(() => removeHouseholdMember(unitId, h.id))}
                      aria-label={t("removeMember", { name: h.fullName })}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-danger-fg"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canWriteHousehold ? (
            <ActionForm action={addHouseholdMember} submitLabel={t("addMember")} resetOnSuccess stayOnSuccess className="mt-3" footer={inlineBar(t("addMember"))}>
              <input type="hidden" name="unitId" value={unitId} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField name="fullName" label={t("fullName")} required>
                  <Input name="fullName" required minLength={2} maxLength={120} />
                </FormField>
                <FormField name="relation" label={t("relationLabel")}>
                  <Select name="relation" defaultValue="spouse">
                    {HOUSEHOLD_RELATIONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`relation.${r}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField name="birthYear" label={t("birthYear")}>
                  <Input name="birthYear" type="number" inputMode="numeric" min={1900} max={2100} />
                </FormField>
                <FormField name="phone" label={t("phone")}>
                  <Input name="phone" type="tel" maxLength={20} />
                </FormField>
              </div>
            </ActionForm>
          ) : null}
        </section>

        <section aria-labelledby="vehicles-title">
          <h4 id="vehicles-title" className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Car aria-hidden className="h-4 w-4" />
            {t("vehicles", { count: extras.vehicles.length })}
          </h4>
          {extras.vehicles.length === 0 ? (
            <p className="text-sm text-fg-subtle">{t("vehiclesEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {extras.vehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono font-semibold">{v.plate}</span>
                    <span className="block text-xs text-fg-subtle">
                      {[v.description, v.ownerName].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  {canWriteVehicles ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(() => removeVehicle(unitId, v.id))}
                      aria-label={t("removeVehicle", { plate: v.plate })}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-danger-fg"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canWriteVehicles ? (
            <ActionForm action={addVehicle} submitLabel={t("addVehicle")} resetOnSuccess stayOnSuccess className="mt-3" footer={inlineBar(t("addVehicle"))}>
              <input type="hidden" name="unitId" value={unitId} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField name="plate" label={t("plate")} required>
                  <Input name="plate" required maxLength={16} placeholder="34 ABC 123" className="uppercase" />
                </FormField>
                <FormField name="description" label={t("vehicleDescription")}>
                  <Input name="description" maxLength={120} placeholder={t("vehicleDescriptionPlaceholder")} />
                </FormField>
                <FormField name="ownerName" label={t("vehicleOwner")}>
                  <Input name="ownerName" maxLength={120} />
                </FormField>
              </div>
            </ActionForm>
          ) : null}
        </section>
      </CardBody>
    </Card>
  );
}
