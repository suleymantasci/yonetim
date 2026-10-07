"use client";

import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";

import {
  Alert,
  Field,
  ModalFormBar,
  Spinner,
  StickyFormBar,
  cn,
  useToast,
} from "@yonetim/ui";

import type { ActionState } from "@/lib/form";
import { useRouteDrawerMarkDirty } from "@/components/route-drawer";

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

const FormContext = createContext<FormContextValue>({
  fieldErrors: {},
  pending: false,
});

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
  /**
   * Başarıda `redirectTo` izlenmesin — akış aynı ekranda sürüyor.
   *
   * Çekmece/modal içinde açılan formlar için: `createUnit` "detay sayfasına
   * git" diyor, ama kullanıcı listeden bir çekmece açtıysa listede kalmak ve
   * "şimdi bu birime sakin ekle" diyebilmek istiyor. Yönlendirme kararı
   * sunucuda kalıyor (tek kaynak), onu **izleyip izlememe** kararı çağıranda.
   */
  stayOnSuccess = false,
  footer,
  className,
  /**
   * `"modal"`: form bir modal/çekmece gövdesini doldurur — alanlar kayar,
   * eylem çubuğu panelin alt kenarında sabit kalır. `"page"` (varsayılan)
   * eski davranış: sayfa kayar, çubuk `sticky` ile takip eder.
   */
  layout = "page",
  /** Modal düzeninde "Vazgeç" düğmesi; genelde paneli kapatır. */
  onCancel,
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
  stayOnSuccess?: boolean;
  footer?: ReactNode | ((state: ActionState<T>) => ReactNode);
  className?: string;
  layout?: "page" | "modal";
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(action, {
    status: "idle",
  } as ActionState<T>);
  const router = useRouter();
  const toast = useToast();
  const markDrawerDirty = useRouteDrawerMarkDirty();
  const t = useTranslations("common");
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const handled = useRef<ActionState<T> | null>(null);

  /*
   * SERVER ACTION'LAR `revalidatePath` ÇAĞIRMAMALI — aşağıdaki etkinin
   * çalışabilmesi buna bağlı.
   *
   * Çağrıldığında Next, aksiyonun yanıtıyla birlikte ağacın yeniden üretilmiş
   * halini gönderiyor; bu da formu yeniden monte ediyor ve `useActionState`
   * durumu `idle`'a düşüyor. Sonuç: sunucu `{"status":"ok"}` dönmesine rağmen
   * bu etki hiç çalışmıyor — bildirim çıkmıyor, `onSuccess` (çekmeceyi kapatan
   * şey) çağrılmıyor, yönlendirme yapılmıyor. Kullanıcının gördüğü şey "kayıt
   * oldu ama form açık kaldı".
   *
   * Ölçüm (üretim derlemesi, gerçek Chrome): tahsilat çekmecesinde aynı form,
   * `revalidatePath` varken kapanmıyor ve bildirim vermiyordu; çağrı
   * kaldırıldığında ikisi de çalıştı. Bu yüzden `apps/app` aksiyonlarındaki
   * 109 çağrı kaldırıldı.
   *
   * KAYIP YOK: panel sayfalarının tamamı `force-dynamic`, yani geçersiz
   * kılınacak bir rota önbelleği zaten yok. Tazeleme aşağıdaki
   * `router.refresh()` ile, yanıttan **sonra** yapılıyor.
   */
  useEffect(() => {
    // Aynı durum nesnesi için iki kez tepki vermeyelim (React 19 çift render).
    if (state.status === "idle" || handled.current === state) return;
    handled.current = state;

    if (state.status === "ok") {
      markDrawerDirty();
      if (!inlineSuccess && state.message) toast.success(state.message);
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.redirectTo && !stayOnSuccess) router.push(state.redirectTo);
      else router.refresh();
      return;
    }

    // Hata: özet kutusuna odak taşı; alan hataları zaten alanların altında.
    if (state.message && !state.fieldErrors) toast.error(state.message);
    summaryRef.current?.focus();
  }, [
    state,
    inlineSuccess,
    onSuccess,
    resetOnSuccess,
    stayOnSuccess,
    router,
    toast,
    markDrawerDirty,
  ]);

  const fieldErrors = state.fieldErrors ?? {};
  const formLevelErrors = fieldErrors._form ?? [];
  const isModal = layout === "modal";

  /**
   * `footer={null}` "alt bar istemiyorum" demek. Burada `??` kullanılıyordu ve
   * `null ?? <StickyFormBar/>` çubuğu **yine de** basıyordu: modal içinde elle
   * yazılmış Vazgeç/Kaydet satırının altında ikinci bir Vazgeç/Kaydet çubuğu
   * beliriyordu (ve `sm:-mx-6` ile birlikte yatay kaydırma). Ayrım artık
   * `undefined` üzerinden.
   */
  const resolvedFooter = typeof footer === "function" ? footer(state) : footer;
  const bar =
    footer !== undefined ? (
      resolvedFooter
    ) : isModal ? (
      <ModalFormBar>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg transition-colors hover:bg-hover"
          >
            {t("action.cancel")}
          </button>
        ) : cancelHref ? (
          <Link
            href={cancelHref}
            className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg transition-colors hover:bg-hover"
          >
            {t("action.cancel")}
          </Link>
        ) : null}
        <SubmitButton label={submitLabel} />
      </ModalFormBar>
    ) : (
      // Yapışkan kaydet çubuğu `packages/ui`'deki `StickyFormBar`;
      // burada ikinci bir kopyası duruyordu ve ikisi ayrışmıştı.
      <StickyFormBar>
        {cancelHref ? (
          // `<a>` idi: iptal, istemci gezinmesi yerine tam sayfa yeniden
          // yükleme yapıyordu (liste durumu ve kaydırma konumu gidiyordu).
          <Link
            href={cancelHref}
            className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg transition-colors hover:bg-hover"
          >
            {t("action.cancel")}
          </Link>
        ) : null}
        <SubmitButton label={submitLabel} />
      </StickyFormBar>
    );

  const body = (
    <>
      {state.status === "error" &&
      (state.message || formLevelErrors.length > 0) ? (
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
    </>
  );

  return (
    <FormContext.Provider value={{ fieldErrors, pending: false }}>
      <form
        ref={formRef}
        action={formAction}
        className={cn(isModal && "flex min-h-0 flex-1 flex-col", className)}
        noValidate
      >
        {isModal ? (
          // Kaydırma **yalnız burada**: panelin gövdesi sabit, alanlar kayar.
          // `overflow-x-hidden` alt kenarda beliren yatay çubuğu kapatır.
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6">
            {body}
          </div>
        ) : (
          body
        )}
        {bar}
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
      className={
        errors
          ? "[&_input]:border-danger [&_select]:border-danger [&_textarea]:border-danger"
          : undefined
      }
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
