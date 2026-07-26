import type {
  InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from "react";

import { cn } from "../cn";

const field =
  "w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-fg " +
  "placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-2 " +
  "focus:ring-ring/40 disabled:bg-surface-sunken disabled:text-fg-subtle";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, className)} {...props} />;
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

/** Onay kutusu — etiketi ile birlikte, dokunma alanı yeterli. */
export function Checkbox({
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-fg">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-border-strong accent-primary"
        {...props}
      />
      <span>
        {label}
        {description ? <span className="block text-xs text-fg-subtle">{description}</span> : null}
      </span>
    </label>
  );
}
