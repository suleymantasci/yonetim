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
 *
 * GÖRSEL KATMAN (UI Faz 2.5): panel artık **her zaman bir flex sütunu**:
 * başlık ve alt bar sabit, yalnız gövde kayar. Önceki hâlde modal gövdesi
 * `max-h-[70dvh]` ile kendi başına kayıyordu, alt bar da içeriğin bir parçası
 * olduğu için kaydırma ile birlikte gidiyordu.
 *
 * `padded={false}`: gövdeyi çağıran doldurur — form kabuğunun kendi kaydırma
 * alanı ve kendi yapışkan alt barı olduğunda gerekli. İki kaydırma alanının
 * iç içe geçmesini (ve alttaki yatay kaydırma çubuğunu) bu ayrım bitiriyor.
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
  /**
   * Gövdeye iç boşluk ve kaydırma verilsin mi? `false` ise gövde yalnız bir
   * flex sütunu olur ve kaydırmayı/boşluğu çocuk yönetir (bkz. `ActionForm`
   * `layout="modal"`).
   */
  padded?: boolean;
}

const PANEL: Record<OverlayVariant, string> = {
  modal:
    "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] " +
    "-translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl " +
    "border border-border bg-surface shadow-2xl ring-1 ring-black/5 " +
    "motion-safe:animate-[overlay-zoom_150ms_ease-out]",
  // Masaüstünde çekmece kenardan 8px içeride ve köşeleri yuvarlak duruyor:
  // ekranın kenarına yapışık dikdörtgen panel, arkadaki listeyi "örtülmüş"
  // değil "kesilmiş" gösteriyordu. Telefonda tam ekran kalıyor — orada
  // kenar boşluğu, zaten dar olan formdan yer çalar.
  drawer:
    "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col overflow-hidden " +
    "border-l border-border bg-surface shadow-2xl " +
    "motion-safe:animate-[overlay-slide-right_180ms_ease-out] " +
    "sm:inset-y-2 sm:right-2 sm:h-auto sm:rounded-2xl sm:border sm:ring-1 sm:ring-black/5",
  sheet:
    "fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] w-full flex-col overflow-hidden " +
    "rounded-t-2xl border-t border-border bg-surface shadow-2xl " +
    "motion-safe:animate-[overlay-slide-up_180ms_ease-out]",
};

/** Ortalanmış modal için genişlik. */
const SIZE: Record<NonNullable<OverlayProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

/**
 * Çekmece genişliği `sm:` altında uygulanmaz: `max-w-sm` telefonda çekmeceyi
 * 384px'e sıkıştırıyor, ekranın sağında bir şerit boş kalıyordu.
 */
const DRAWER_SIZE: Record<NonNullable<OverlayProps["size"]>, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
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
  padded = true,
}: OverlayProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] motion-safe:animate-[overlay-fade_120ms_ease-out]" />
        <Dialog.Content
          className={cn(
            PANEL[variant],
            variant === "modal" && SIZE[size],
            variant === "drawer" && DRAWER_SIZE[size],
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
          {/* Alttan açılan yaprakta tutamaç: parmakla kapatılabileceğinin
              tek görsel ipucu. Fare kullanıcısı için zararsız bir çizgi. */}
          {variant === "sheet" ? (
            <div aria-hidden className="flex justify-center pt-2">
              <span className="h-1 w-10 rounded-full bg-border-strong" />
            </div>
          ) : null}

          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold tracking-tight text-fg sm:text-lg">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm leading-relaxed text-fg-muted">
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
                className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="h-5 w-5" />
              </Dialog.Close>
            ) : null}
          </div>

          <div
            className={cn(
              // `overflow-x-hidden`: gövde içindeki tam genişlik (negatif
              // kenar boşluklu) şeritler bir piksel taşsa bile panelin
              // altında yatay kaydırma çubuğu belirmesin.
              padded
                ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6"
                : "flex min-h-0 flex-1 flex-col",
            )}
          >
            {children}
          </div>

          {footer ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-sunken px-5 py-3 sm:px-6">
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
