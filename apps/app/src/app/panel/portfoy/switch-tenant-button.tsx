"use client";

import { ArrowRight } from "lucide-react";
import { useFormStatus } from "react-dom";

import { switchTenant } from "./actions";

/**
 * Siteye geç düğmesi.
 *
 * Form olarak yazıldı, `onClick` olarak değil: JavaScript yüklenmeden de
 * çalışıyor ve gezinme tarayıcının kendi akışında kalıyor.
 */
export function SwitchTenantButton({
  tenantId,
  label,
}: {
  tenantId: string;
  label: string;
}) {
  return (
    <form action={switchTenant}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <SubmitButton label={label} />
    </form>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border-strong px-2.5 py-1.5 text-sm font-medium text-fg hover:bg-hover disabled:opacity-50"
    >
      {label}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </button>
  );
}
