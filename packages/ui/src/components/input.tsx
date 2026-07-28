import type {
  InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from "react";

import { cn } from "../cn";

/**
 * Ortak alan görünümü — UI Faz 2.4 (görsel katman; davranış değişmedi).
 *
 * Üç düzeltme:
 *  · **Yükseklik `h-10`** — düğmeler zaten `h-10`; alan `py-2` ile 36px'te
 *    kalıyordu ve yan yana duran "Ara" alanı ile "Filtrele" düğmesi bir
 *    piksel kaymış görünüyordu.
 *  · **`rounded-lg`** — kart, düğme ve çekmece `rounded-lg/xl` iken alanlar
 *    `rounded` (4px) idi; tek uyumsuz yarıçap tüm formu eski gösteriyordu.
 *  · **`aria-invalid` görsel karşılığı** — hata durumunda kenarlığı
 *    `ActionForm`'daki `[&_input]:border-danger` seçicisi boyuyordu, yani
 *    doğrulama görüntüsü form kabuğuna bağımlıydı. Artık alanın kendisi
 *    `aria-invalid`'e tepki veriyor.
 */
const field =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg " +
  "transition-colors placeholder:text-fg-subtle hover:border-fg-subtle " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40 " +
  "aria-[invalid=true]:border-danger " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-10", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-fg">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </span>
      {children}
      {hint && !error ? <span className="block text-xs text-fg-subtle">{hint}</span> : null}
      {error ? <span className="block text-xs text-danger-fg">{error}</span> : null}
    </label>
  );
}

/**
 * Onay kutusu — etiketi ile birlikte.
 *
 * UI Faz 2.5 düzeltmeleri: kutu 16px'ten 18px'e büyütüldü (dokunmatikte
 * ıskalanıyordu), `accent-primary`'nin tarayıcıya bıraktığı odak halkası
 * yerine tasarım sistemindeki `ring` kullanılıyor ve ilk satırın taban
 * çizgisiyle hizası `mt-0.5` tahmininden `h-5` (etiket satır yüksekliği)
 * içinde ortalamaya çevrildi — açıklamalı ve açıklamasız kullanımda aynı
 * hizada duruyor. Etiketin tamamı tıklanabilir olduğu için hedef alanı
 * kutunun kendisiyle sınırlı değil.
 */
export function Checkbox({
  label,
  description,
  className,
  disabled,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 text-sm text-fg",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <span className="flex h-5 shrink-0 items-center">
        <input
          type="checkbox"
          disabled={disabled}
          className={cn(
            "h-[18px] w-[18px] rounded border-border-strong accent-primary disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          )}
          {...props}
        />
      </span>
      <span className="min-w-0">
        <span className="block leading-5">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-fg-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
