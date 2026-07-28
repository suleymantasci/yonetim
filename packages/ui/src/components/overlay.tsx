"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * Overlay ailesi — SPEC Bölüm 11.4, GAP 4.4.5, MIMARI-PLAN §14 Track C1.
 *
 * Modal / Drawer / Sheet üçlüsü tek bir ilkelden türer: aynı odak tuzağı,
 * aynı ESC davranışı, aynı backdrop. Değişen yalnız panelin nereden geldiği.
 *
 * NEDEN ELLE YAZILMIŞ HÂLİNDEN VAZGEÇİLDİ (C1): önceki sürüm Tab döngüsünü,
 * ESC'i ve odak dönüşünü doğru yapıyordu — ama bir modalı erişilebilir kılan
 * şey bunlarla bitmiyor. Üç somut açık vardı:
 *
 *  1. **Arka plan ekran okuyucudan gizlenmiyordu.** Odak tuzağı yalnız Tab'ı
 *     yakalar; VoiceOver/NVDA sanal imleci sekme sırasını hiç kullanmadan
 *     arkadaki içeriği okumaya devam ediyordu. Modalın "modal" olmasının
 *     anlamı tam da bu değil.
 *  2. **Portal'a çıkan içerik tuzağın dışında kalıyordu.** Panel içindeki bir
 *     açılır liste `document.body`'ye render edilirse `panelRef.querySelectorAll`
 *     onu göremez ve Tab kullanıcıyı sessizce dışarı atar.
 *  3. **Kaydırma kilidi kaydırma çubuğu genişliğini telafi etmiyordu**; modal
 *     açılınca arkadaki sayfa yatay olarak sıçrıyordu.
 *
 * Üçünü de doğru yazmak mümkün ama üçü de "yazdıktan sonra bir daha
 * bakılmayan" türden kod. Radix Dialog bunları zaten çözüyor ve ~9 kB gzip
 * getiriyor. Bundle politikası (GAP 7.2) harici kütüphaneye kapalı değil,
 * **karşılıksız** harici kütüphaneye kapalı.
 *
 * DIŞ API DEĞİŞMEDİ: `open`/`onClose`/`title`/`variant` aynı. Çağıran taraf
 * için bu değişiklik görünmez — görünür olan tek şey davranışın düzelmesi.
 */

export type OverlayVariant = "modal" | "drawer" | "sheet";

export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** modal = ortada, drawer = sağdan, sheet = alttan. */
  variant?: OverlayVariant;
  size?: "sm" | "md" | "lg" | "xl";
  /** `false` ise ESC ve backdrop kapatmaz — yalnız açık bir eylem kapatır. */
  dismissible?: boolean;
  closeLabel?: string;
  className?: string;
}

const PANEL: Record<OverlayVariant, string> = {
  modal:
    "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 " +
    "rounded-xl border border-border bg-surface shadow-xl " +
    "motion-safe:animate-[overlay-zoom_150ms_ease-out]",
  drawer:
    "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-border " +
    "bg-surface shadow-xl motion-safe:animate-[overlay-slide-right_180ms_ease-out]",
  sheet:
    "fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] w-full flex-col rounded-t-2xl " +
    "border-t border-border bg-surface shadow-xl " +
    "motion-safe:animate-[overlay-slide-up_180ms_ease-out]",
};

const SIZE: Record<NonNullable<OverlayProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  size = "md",
  dismissible = true,
  closeLabel = "Kapat",
  className,
}: OverlayProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay motion-safe:animate-[overlay-fade_120ms_ease-out]" />
        <Dialog.Content
          className={cn(
            PANEL[variant],
            variant === "modal" && SIZE[size],
            variant === "drawer" && (size === "xl" ? "max-w-2xl" : SIZE[size]),
            "outline-none",
            className,
          )}
          // `dismissible={false}`: geri dönüşü olmayan bir işlemin ortasında
          // yanlışlıkla ESC'e basmak, işlemi yarıda bırakmamalı.
          onEscapeKeyDown={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (!dismissible) event.preventDefault();
          }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border p-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-fg">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-fg-muted">
                  {description}
                </Dialog.Description>
              ) : (
                /**
                 * Radix açıklama yoksa konsola uyarı basıyor. Boş bir
                 * `Description` koymak yerine bağlantıyı açıkça kesiyoruz:
                 * ekran okuyucuya boş bir metin okutmak, hiç okutmamaktan
                 * daha kötü.
                 */
                <VisuallyHiddenDescriptionOff />
              )}
            </div>
            {dismissible ? (
              <Dialog.Close
                aria-label={closeLabel}
                className="-m-1 rounded-lg p-1 text-fg-subtle hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="h-5 w-5" />
              </Dialog.Close>
            ) : null}
          </div>

          <div
            className={cn(
              "p-4",
              variant === "modal"
                ? "max-h-[70dvh] overflow-y-auto"
                : "flex-1 overflow-y-auto",
            )}
          >
            {children}
          </div>

          {footer ? (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-sunken p-4">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** `aria-describedby`'ı açıkça kaldırır — Radix'in uyarısını da susturur. */
function VisuallyHiddenDescriptionOff() {
  return <Dialog.Description className="sr-only" />;
}

export function Modal(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="modal" />;
}

export function Drawer(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="drawer" />;
}

export function Sheet(props: Omit<OverlayProps, "variant">) {
  return <Overlay {...props} variant="sheet" />;
}

/**
 * Yıkıcı işlem onayı — GAP-DURUM kararı 8.
 *
 * Silme/iptal gibi geri dönüşü zor akışlarda doğrudan `Modal` kurmak yerine
 * bu kullanılır ki metin ve ton tutarlı kalsın. `dismissible` açık: onay
 * istenen kullanıcı **vazgeçebilmeli**; kapatmayı zorlaştırmak, yanlış
 * tıklamayı azaltmaz, sadece sinir bozar.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  pending,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  /** Açıklamanın ötesinde ek içerik (etkilenen kayıt listesi, gerekçe alanı). */
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      closeLabel={cancelLabel}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn(
              "inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-50",
              tone === "danger"
                ? "bg-danger text-primary-fg hover:brightness-95"
                : "bg-primary text-primary-fg hover:bg-primary-hover",
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {/*
       * Açıklama `description` yuvasından gelir; burada BİR KEZ DAHA yazılıyordu
       * ve onay diyaloğunda aynı cümle iki kez görünüyordu (tarayıcıda ölçüldü:
       * "Kayıtlar 30 gün çöp kutusunda kalır…" başlığın altında ve gövdede).
       * Gövde artık yalnız çağıranın verdiği ek içeriği taşıyor.
       */}
      {children}
    </Modal>
  );
}
