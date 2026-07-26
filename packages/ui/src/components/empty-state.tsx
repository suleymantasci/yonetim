import type { ReactNode } from "react";

/** SPEC Bölüm 11.2 — "Empty state'ler eğitici": ne yapılacağını adım adım anlatır. */
export function EmptyState({
  title,
  description,
  action,
  icon,
  steps,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  steps?: string[];
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong p-10 text-center">
      {icon ? (
        <div aria-hidden className="mb-3 text-fg-subtle">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p>
      {steps?.length ? (
        <ol className="mt-4 max-w-md space-y-1.5 text-left text-sm text-fg-muted">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-fg">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
