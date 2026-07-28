import type { ReactNode } from "react";

import { cn } from "../cn";
import { Breadcrumb, type Crumb, type LinkLike } from "./navigation";

/**
 * Sayfa başlığı bloğu — kırıntı yolu + başlık + açıklama + birincil aksiyon.
 *
 * GAP 4.3.1: her liste/detay sayfasının sağ üstünde birincil aksiyon
 * (`Yeni Birim`, `Yeni Gider`) ve derin sayfalarda kırıntı yolu bulunmalı.
 *
 * NEDEN `packages/ui`'DE: `apps/app`'te 40'a yakın sayfa aynı bloğu kuruyor.
 * Uygulamada kalsaydı ikinci bir uygulama (ör. sakin portalı) aynı markup'ı
 * üçüncü kez yazacaktı. Bağlantı bileşeni yine enjekte ediliyor — paket
 * Next'e bağımlı değil.
 *
 * Aksiyon yuvası bilerek `ReactNode`: kimi sayfa tek buton, kimi sayfa bir
 * segment denetimi + iki buton koyuyor. Buraya bir "actions: Action[]" API'si
 * koymak, her yeni ihtiyaçta bu dosyayı açmak demekti.
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
  meta,
  tabs,
  linkComponent,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumb?: Crumb[];
  /** Başlığın yanında rozet/durum bilgisi. */
  meta?: ReactNode;
  /** Başlığın altındaki sekme şeridi (`Tabs`). */
  tabs?: ReactNode;
  linkComponent?: LinkLike;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <Breadcrumb items={breadcrumb} linkComponent={linkComponent} />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-fg">
              {title}
            </h1>
            {meta}
          </div>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="flex flex-wrap items-center gap-2">{action}</div>
        ) : null}
      </div>

      {tabs ? <div className="mt-4">{tabs}</div> : null}
    </div>
  );
}

/**
 * Sayfa başlığındaki aksiyon düğmelerinin ortak görünümü.
 *
 * Sınıf dizisi 40 sayfada elle kopyalanıyordu; birinde `h-10`, diğerinde
 * `py-2` yazılınca aynı satırdaki iki düğme farklı yükseklikte çıkıyordu.
 */
export const pageActionClasses = {
  primary:
    "inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  secondary:
    "inline-flex h-10 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold text-fg transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
  ghost:
    "inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-fg-muted transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
} as const;
