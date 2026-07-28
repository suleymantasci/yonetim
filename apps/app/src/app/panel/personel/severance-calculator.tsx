"use client";

import { Calculator } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  DateInput,
  FormSection,
  MoneyInput,
  Select,
  Spinner,
  Switch,
  tableClasses as tc,
} from "@yonetim/ui";

import { FormField } from "@/components/form/action-form";
import { quoteSeverance, type SeveranceQuoteView } from "./actions";

/**
 * Kıdem/ihbar tazminatı hesaplayıcı — rakip incelemesi §4.1.
 *
 * ÜÇ TASARIM KARARI:
 *
 * 1. **Hakların doğup doğmadığı açıkça sorulur, varsayılmaz.** İstifa eden
 *    işçi kıdem, haklı nedenle çıkarılan ihbar tazminatı alamaz. Bu bir olgu
 *    değerlendirmesi; kod bunu personel kaydından türetemez. İki anahtarı
 *    gizleyip "her zaman öder" varsaymak, yöneticiye ödemek zorunda olmadığı
 *    bir rakamı taahhüt ettirirdi.
 *
 * 2. **Ücret ezilebilir.** Yöneticinin gerçekten sorduğu soru "zam yapsak
 *    tazminat ne olur". Ezme personel kaydını değiştirmez, yalnız hesabı
 *    besler.
 *
 * 3. **Sonuç "yaklaşık" olarak, parametre tarihiyle birlikte gösterilir.**
 *    Gelir vergisi gerçekte kümülatif matrahtan hesaplanıyor; buradaki tek
 *    marjinal oran bir tahmin. Kıdem tavanı da 6 ayda bir değişiyor — hangi
 *    tarihli tavanla hesaplandığı ekranda yazıyor ki eskimiş bir parametre
 *    sessiz kalmasın.
 *
 * Hesabın kendisi burada **değil**: `packages/core/src/severance.ts` içinde
 * ve test altında. Bu bileşen girdi toplayıp sonucu gösteriyor.
 */
export function SeveranceCalculator({
  staff,
}: {
  readonly staff: { id: string; name: string; grossKurus: number }[];
}) {
  const t = useTranslations("app.staff");
  const tCommon = useTranslations("common");

  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [endedAt, setEndedAt] = useState(today());
  const [overrideKurus, setOverrideKurus] = useState(0);
  const [severanceApplies, setSeveranceApplies] = useState(true);
  const [noticeApplies, setNoticeApplies] = useState(true);
  const [result, setResult] = useState<SeveranceQuoteView | null>(null);
  const [pending, startTransition] = useTransition();

  if (staff.length === 0) return null;

  function run() {
    startTransition(async () => {
      setResult(
        await quoteSeverance({
          staffId,
          endedAt,
          // 0 "ücret sıfır" değil "ezme yok" demek; uca hiç gönderilmiyor.
          monthlyGrossOverrideKurus:
            overrideKurus > 0 ? overrideKurus : undefined,
          severanceApplies,
          noticeApplies,
        }),
      );
    });
  }

  const data = result?.data;

  return (
    <Card className="mt-4">
      <CardHeader
        title={t("severanceTitle")}
        description={t("severanceDescription")}
      />
      <CardBody>
        <FormSection title={t("severanceInputs")}>
          <FormField name="severanceStaffId" label={t("fullName")}>
            <Select
              name="severanceStaffId"
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
            >
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField name="severanceEndedAt" label={t("severanceEndDate")}>
            <DateInput
              name="severanceEndedAt"
              defaultValue={endedAt}
              onValueChange={setEndedAt}
            />
          </FormField>

          <FormField
            name="severanceOverride"
            label={t("severanceOverride")}
            hint={t("severanceOverrideHint")}
          >
            <MoneyInput
              name="severanceOverride"
              defaultKurus={0}
              onKurusChange={setOverrideKurus}
            />
          </FormField>

          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <Switch
              name="severanceApplies"
              label={t("severanceAppliesLabel")}
              description={t("severanceAppliesHint")}
              checked={severanceApplies}
              onCheckedChange={setSeveranceApplies}
            />
            <Switch
              name="noticeApplies"
              label={t("noticeAppliesLabel")}
              description={t("noticeAppliesHint")}
              checked={noticeApplies}
              onCheckedChange={setNoticeApplies}
            />
          </div>
        </FormSection>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={pending || !staffId}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? (
              <Spinner className="h-4 w-4" label={tCommon("state.loading")} />
            ) : (
              <Calculator aria-hidden className="h-4 w-4" />
            )}
            {t("severanceCalculate")}
          </button>
        </div>

        {/*
          `aria-live`: sonuç düğmeye basınca yerinde beliriyor, odak taşınmıyor.
          Ekran okuyucu kullanıcısı hesabın çıktığını duymazsa düğmenin
          çalışmadığını sanar.
        */}
        <div aria-live="polite" className="mt-4">
          {result && !result.ok ? (
            <Alert tone="danger">{result.message}</Alert>
          ) : null}

          {data ? (
            <>
              {data.belowMinimumService ? (
                <div className="mb-3">
                  <Alert tone="warning">{t("severanceBelowMinimum")}</Alert>
                </div>
              ) : null}

              {data.ceilingExcessKurus > 0 ? (
                <div className="mb-3">
                  <Alert tone="info">
                    {t("severanceCeilingApplied", {
                      capped: money(data.cappedMonthlyGrossKurus),
                      excess: money(data.ceilingExcessKurus),
                    })}
                  </Alert>
                </div>
              ) : null}

              <p className="mb-2 text-sm text-fg-muted">
                {t("severanceServiceSummary", {
                  name: data.staffName,
                  years: data.serviceYears,
                  months: data.serviceMonthsRemainder,
                  weeks: data.noticeWeeks,
                })}
              </p>

              <div className={tc.wrapper}>
                <table className={tc.table} style={{ minWidth: 560 }}>
                  <thead className={tc.thead}>
                    <tr>
                      <th scope="col" className={tc.th}>
                        {t("severanceComponent")}
                      </th>
                      <th scope="col" className={`${tc.th} text-right`}>
                        {t("severanceGross")}
                      </th>
                      <th scope="col" className={`${tc.th} text-right`}>
                        {t("severanceStampDuty")}
                      </th>
                      <th scope="col" className={`${tc.th} text-right`}>
                        {t("severanceIncomeTax")}
                      </th>
                      <th scope="col" className={`${tc.th} text-right`}>
                        {t("severanceNet")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={tc.tr}>
                      <th scope="row" className={`${tc.td} font-medium`}>
                        {t("severanceRow")}
                      </th>
                      <td className={tc.tdNum}>
                        {money(data.severance.grossKurus)}
                      </td>
                      <td className={tc.tdNum}>
                        {money(data.severance.stampDutyKurus)}
                      </td>
                      {/* Kıdem gelir vergisinden istisna — çizgi, sıfır değil:
                          "0 ₺ vergi hesaplandı" ile "vergiye tabi değil" farklı. */}
                      <td className={`${tc.tdNum} text-fg-subtle`}>—</td>
                      <td className={`${tc.tdNum} font-semibold`}>
                        {money(data.severance.netKurus)}
                      </td>
                    </tr>
                    <tr className={tc.tr}>
                      <th scope="row" className={`${tc.td} font-medium`}>
                        {t("noticeRow")}
                      </th>
                      <td className={tc.tdNum}>
                        {money(data.notice.grossKurus)}
                      </td>
                      <td className={tc.tdNum}>
                        {money(data.notice.stampDutyKurus)}
                      </td>
                      <td className={tc.tdNum}>
                        {money(data.notice.incomeTaxKurus)}
                      </td>
                      <td className={`${tc.tdNum} font-semibold`}>
                        {money(data.notice.netKurus)}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-border-strong">
                      <th scope="row" className={`${tc.td} font-semibold`}>
                        {t("severanceTotal")}
                      </th>
                      <td className={tc.tdNum} colSpan={3} />
                      <td className={`${tc.tdNum} text-base font-bold`}>
                        {money(data.totalNetKurus)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <Alert tone="warning">
                  {t("severanceEstimateNotice", {
                    date: data.parametersEffectiveFrom,
                    ceiling: money(data.ceilingKurus),
                    rate: Math.round(data.incomeTaxRate * 100),
                  })}
                </Alert>
              </div>
            </>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Biçimlendirme burada yerel: `formatters()` sunucu tarafı bir yardımcı ve bu
 * bileşen istemcide çalışıyor. Kuruş → ₺ dönüşümü tek satır olduğu için
 * ayrı bir istemci biçimlendiricisi kurmaya değmiyor.
 */
function money(kurus: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(kurus / 100);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
