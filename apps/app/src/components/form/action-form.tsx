"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext, useActionState, useContext, useEffect, useId, useRef,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import { Alert, Field, Spinner, useToast } from "@yonetim/ui";

import type { ActionState } from "@/lib/form";

/**
 * Server Action'a bağlı form kabuğu — GAP TD-01.
 *
 * Bir formun tekrar eden her parçasını üstlenir:
 * - `useActionState` ile durum yönetimi (JS kapalıyken de form gönderilir)
 * - başarı/hata **toast**'u (GAP 4.6.1) ve gerektiğinde yönlendirme
 * - alan hatalarını `FormField` altına dağıtan bağlam
 * - gönderim sırasında butonların kilitlenmesi
 * - hata özetine odak taşınması (ekran okuyucu kullanıcısı hatayı duyar)
 *
 * Kullanım kalıbı: `ActionForm` bir Server Action ve gönder etiketini alır;
 * içine her alan için bir `FormField` + ilgili girdi bileşeni konur. Alan adı
 * (`name`) hem `FormData` anahtarı hem hata eşleştirme anahtarıdır — Zod
 * şemasındaki alan adıyla birebir aynı olmalıdır.
 */

interface FormContextValue {
  fieldErrors: Record<string, string[]>;
  pending: boolean;
}

const FormContext = createContext<FormContextValue>({ fieldErrors: {}, pending: false });

export type ServerAction<T = undefined> = (
  previous: ActionState<T>,
  formData: FormData,
) => Promise<ActionState<T>>;

export function ActionForm<T = undefined>({
  action,
  children,
  submitLabel,
  cancelHref,
  onSuccess,
  /** Başarıda formu sıfırla (aynı ekranda seri kayıt girişi için). */
  resetOnSuccess = false,
  /** Toast yerine form içinde başarı kutusu göster. */
  inlineSuccess = false,
  footer,
  className,
}: {
  action: ServerAction<T>;
  /**
   * Fonksiyon verilirse aksiyonun son durumunu alır. Çok adımlı sihirbazlar
   * (toplu birim üretimi gibi) sunucudan dönen önizlemeyi böyle çiziyor —
   * ayrı bir istemci state'i tutmadan, tek doğruluk kaynağı yine sunucu.
   */
  children: ReactNode | ((state: ActionState<T>) => ReactNode);
  submitLabel: string;
  cancelHref?: string;
  onSuccess?: (state: ActionState<T>) => void;
  resetOnSuccess?: boolean;
  inlineSuccess?: boolean;
  footer?: ReactNode | ((state: ActionState<T>) => ReactNode);
  className?: string;
}) {
  const [state, formAction] = useActionState(action, { status: "idle" } as ActionState<T>);
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations("common");
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const handled = useRef<ActionState<T> | null>(null);

  useEffect(() => {
    // Aynı durum nesnesi için iki kez tepki vermeyelim (React 19 çift render).
    if (state.status === "idle" || handled.current === state) return;
    handled.current = state;

    if (state.status === "ok") {
      if (!inlineSuccess && state.message) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
      return;
    }

    // Hata: özet kutusuna odak taşı; alan hataları zaten alanların altında.
    if (state.message && !state.fieldErrors) toast.error(state.message);
    summaryRef.current?.focus();
  }, [state, inlineSuccess, onSuccess, resetOnSuccess, router, toast]);

  const fieldErrors = state.fieldErrors ?? {};
  const formLevelErrors = fieldErrors._form ?? [];

  return (
    <FormContext.Provider value={{ fieldErrors, pending: false }}>
      <form ref={formRef} action={formAction} className={className} noValidate>
        {state.status === "error" && (state.message || formLevelErrors.length > 0) ? (
          <div ref={summaryRef} tabIndex={-1} className="mb-4 outline-none">
            <Alert tone="danger" title={state.message ?? t("state.error")}>
              {formLevelErrors.length > 0 ? (
                <ul className="list-inside list-disc">
                  {formLevelErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          </div>
        ) : null}

        {inlineSuccess && state.status === "ok" && state.message ? (
          <div className="mb-4">
            <Alert tone="success">{state.message}</Alert>
          </div>
        ) : null}

        {typeof children === "function" ? children(state) : children}

        {(typeof footer === "function" ? footer(state) : footer) ?? (
          <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            {cancelHref ? (
              <a
                href={cancelHref}
                className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
              >
                {t("action.cancel")}
              </a>
            ) : null}
            <SubmitButton label={submitLabel} />
          </div>
        )}
      </form>
    </FormContext.Provider>
  );
}

/** Gönderim sırasında kilitlenen ve dönen gösterge basan kaydet butonu. */
export function SubmitButton({
  label,
  variant = "primary",
  name,
  value,
}: {
  label: string;
  variant?: "primary" | "danger" | "outline";
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const t = useTranslations("common");

  const styles =
    variant === "danger"
      ? "bg-danger text-primary-fg hover:brightness-95"
      : variant === "outline"
        ? "border border-border-strong bg-surface text-fg hover:bg-hover"
        : "bg-primary text-primary-fg hover:bg-primary-hover";

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${styles}`}
    >
      {pending ? <Spinner label={t("state.processing")} /> : null}
      {pending ? t("state.processing") : label}
    </button>
  );
}

/**
 * Etiket + alan + hata üçlüsü. Hata mesajını bağlamdan kendisi okur,
 * `aria-describedby` ile alana bağlar ve `aria-invalid` işaretler.
 */
export function FormField({
  name,
  label,
  hint,
  required,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const { fieldErrors } = useContext(FormContext);
  const errors = fieldErrors[name];
  const errorId = useId();

  return (
    <div
      data-field={name}
      aria-describedby={errors ? errorId : undefined}
      className={errors ? "[&_input]:border-danger [&_select]:border-danger [&_textarea]:border-danger" : undefined}
    >
      <Field label={label} hint={hint} required={required} error={errors?.[0]}>
        {children}
      </Field>
      {errors && errors.length > 1 ? (
        <ul id={errorId} className="mt-0.5 space-y-0.5 text-xs text-danger-fg">
          {errors.slice(1).map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Alan hatası olup olmadığını bilmek isteyen özel kontroller için. */
export function useFieldError(name: string): string | undefined {
  return useContext(FormContext).fieldErrors[name]?.[0];
}
