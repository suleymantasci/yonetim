"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Alert, PeriodInput, kurusToDisplay } from "@yonetim/ui";

// Yalnız **tip** alınıyor: `@/lib/form` çalışma zamanında `@/lib/context`
// üzerinden `next/headers`'a bağlanıyor ve o yalnız sunucuda çalışır. Değer
// olarak `idleState()` çağırmak, bu istemci bileşenini derlenemez yapıyordu.
import type { ActionState } from "@/lib/form";
import { runDuesPlan, type DuesRunState } from "./actions";

const IDLE: ActionState<DuesRunState> = { status: "idle" };

/**
 * "Planı şimdi çalıştır" — PROJE-DURUMU §5.4.
 *
 * İKİ AŞAMALI VE ÖNİZLEME VARSAYILAN: "Önizle" düğmesi hiçbir şey yazmıyor,
 * kaç borç ve ne kadar tutar üreteceğini söylüyor. "Uygula" ancak ondan
 * sonra basılıyor. Borç üretmek geri alınması pahalı bir iş — üretilen her
 * borç sakine bildirim doğuruyor — ve tek tıkla yanlış dönemi üretilebilir
 * kılmak kabul edilebilir değildi.
 *
 * İki basış ikinci bir borç dalgası üretmiyor: `dues_runs` üzerindeki
 * (plan, dönem) tekil indeksi bunu zaten engelliyor ve sunucu "bu dönem
 * zaten üretilmiş" cevabı veriyor.
 */
export function RunPlanForm({
  planId,
  defaultPeriod,
}: {
  planId: string;
  defaultPeriod: string;
}) {
  const t = useTranslations("app.duesPlans");
  const [state, formAction, pending] = useActionState<
    ActionState<DuesRunState>,
    FormData
  >(runDuesPlan, IDLE);

  const preview = state.data;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={planId} />

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-fg">{t("runPeriod")}</span>
        <PeriodInput name="period" defaultValue={defaultPeriod} required />
      </label>

      <p className="text-xs text-fg-subtle">{t("runHint")}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-fg hover:bg-hover disabled:opacity-60"
        >
          <Play aria-hidden className="h-4 w-4" />
          {pending ? t("runWorking") : t("runPreviewAction")}
        </button>

        {/*
          "Uygula" yalnız önizleme yapıldıktan **ve** üretilecek borç
          çıktıktan sonra görünüyor. Sıfır borç üretecek bir koşuyu uygulamak
          anlamsız; düğmeyi göstermek yöneticiyi boşuna tereddüde sokardı.
        */}
        {preview && preview.dryRun && !preview.skipped && preview.generated > 0 ? (
          <button
            type="submit"
            name="apply"
            value="1"
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
          >
            {t("runApplyAction", { count: preview.generated })}
          </button>
        ) : null}
      </div>

      {state.message ? (
        <Alert tone={state.status === "ok" ? "success" : "danger"}>
          {state.message}
        </Alert>
      ) : null}

      {preview && !preview.skipped ? (
        <div className="rounded-lg bg-surface-sunken p-3">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-fg-subtle">{t("runCount")}</dt>
              <dd className="font-semibold tabular-nums text-fg">
                {preview.generated}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">{t("runTotal")}</dt>
              <dd className="font-semibold tabular-nums text-fg">
                {kurusToDisplay(preview.totalKurus)} ₺
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {preview?.fellBackToEqual ? (
        <Alert tone="warning">{t("runFellBackToEqual")}</Alert>
      ) : null}
    </form>
  );
}
