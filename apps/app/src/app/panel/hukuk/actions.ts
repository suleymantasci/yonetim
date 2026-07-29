"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { apiPatch, apiPost } from "@/lib/api/server";
import {
  kurusField,
  okState,
  optionalText,
  requiredText,
  runAction,
  uuidField,
  V,
  type ActionState,
} from "@/lib/form";

/**
 * İcra/hukuk takibi — yazma köprüsü, PROJE-DURUMU §5.5.
 *
 * KURALLAR SUNUCUDA: ana paranın açık borçlardan toplanması, aynı daireye
 * ikinci açık dosya açılamaması, aşama değişikliğinin dosya kütüğüne
 * yazılması ve tutarların artımlı işlenmesi `apps/api`'de. Buradaki tek iş
 * form doğrulaması ve HTTP — tutar hesabı bu dosyaya taşınsaydı ekranda
 * gösterilen ile dosyaya yazılan ayrışabilirdi.
 */
const STAGES = [
  "warning_letter",
  "notice_served",
  "lawsuit",
  "judgment",
  "enforcement",
  "seizure",
  "collection",
] as const;

const ok = z.object({ ok: z.literal(true) });

export async function openLegalCase(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "legal:write",
      schema: z.object({
        unitId: uuidField,
        caseNo: optionalText(60),
        note: optionalText(1000),
      }),
      meta: { action: "legal_case_opened", resource: "legal_case" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.legal");

      // Tutar **gönderilmiyor**: dosyanın ana parası dairenin açık
      // borçlarından sunucuda toplanıyor.
      await apiPost(
        "/v1/panel/legal",
        {
          unitId: input.unitId,
          caseNo: input.caseNo ?? null,
          note: input.note ?? null,
        },
        z.object({ id: z.string().uuid() }),
      );

      revalidatePath("/panel/hukuk");
      return okState(t("caseOpened"));
    },
  );
}

export async function updateLegalCase(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "legal:write",
      schema: z.object({
        id: uuidField,
        stage: z.enum(STAGES, { errorMap: () => ({ message: V.invalidSelection }) }),
        nextActionAt: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
          z.coerce.date().optional(),
        ),
        nextActionNote: optionalText(500),
        note: optionalText(1000),
      }),
      meta: { action: "legal_case_updated", resource: "legal_case" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.legal");

      await apiPatch(
        `/v1/panel/legal/${input.id}`,
        {
          stage: input.stage,
          nextActionAt: input.nextActionAt ?? null,
          nextActionNote: input.nextActionNote ?? null,
          note: input.note ?? null,
        },
        ok,
      );

      revalidatePath("/panel/hukuk");
      return okState(t("caseUpdated"));
    },
  );
}

export async function addLegalEvent(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "legal:write",
      schema: z.object({
        id: uuidField,
        title: requiredText(1, 200),
        note: optionalText(2000),
      }),
      meta: { action: "legal_event_added", resource: "legal_case" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.legal");

      await apiPost(
        `/v1/panel/legal/${input.id}/events`,
        { title: input.title, note: input.note ?? null },
        ok,
      );

      revalidatePath("/panel/hukuk");
      return okState(t("eventAdded"));
    },
  );
}

export async function addLegalAmount(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "legal:write",
      schema: z.object({
        id: uuidField,
        kind: z.enum(["cost", "collection"], {
          errorMap: () => ({ message: V.invalidSelection }),
        }),
        // Kuruşa çeviren ortak alan: ekranda "1.250,50" yazan tutar
        // sunucuya 125050 gidiyor.
        amountMinor: kurusField({ min: 1 }),
        note: optionalText(500),
      }),
      meta: { action: "legal_amount_added", resource: "legal_case" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.legal");

      await apiPost(
        `/v1/panel/legal/${input.id}/amounts`,
        {
          kind: input.kind,
          amountMinor: input.amountMinor,
          note: input.note ?? null,
        },
        ok,
      );

      revalidatePath("/panel/hukuk");
      return okState(
        input.kind === "cost" ? t("costAdded") : t("collectionAdded"),
      );
    },
  );
}

export async function closeLegalCase(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    {
      permission: "legal:write",
      schema: z.object({
        id: uuidField,
        // Gerekçe zorunlu ve sunucu da arıyor: kapatılmış bir icra dosyasının
        // "neden" kapatıldığı, sonradan sorulacak ilk soru.
        reason: requiredText(10, 500),
      }),
      meta: { action: "legal_case_closed", resource: "legal_case" },
    },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.legal");

      await apiPost(`/v1/panel/legal/${input.id}/close`, { reason: input.reason }, ok);

      revalidatePath("/panel/hukuk");
      return okState(t("caseClosed"));
    },
  );
}
