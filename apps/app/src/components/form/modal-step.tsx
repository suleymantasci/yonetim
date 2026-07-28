"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Modal/çekmece içindeki "kaydedildi — şimdi ne yapalım?" adımı — UI Faz 2.5.
 *
 * Üç akış (`NewUnitFlow`, `NewResidentFlow`, `NewExpenseFlow`) bu ekranı
 * birbirinden kopyalayarak taşıyordu; üçü de zamanla ayrışmıştı (ikon boyutu,
 * boşluklar, hizalama). Tek yerde toplandı ve bu arada iki görsel sorun
 * giderildi:
 *
 *  · **Kaydırma kapsayıcısı yoktu.** Adım, `padded={false}` verilen çekmece
 *    gövdesine doğrudan düşüyordu; kısa içerikte sorun görünmüyordu ama
 *    telefonda dört düğme alt alta gelince taşıyordu. Artık kendi kayan
 *    alanını kuruyor.
 *  · **Sola dayalı ve dar bir blok**tu; onay ekranı ortalanınca 3xl genişliğe
 *    çıkan çekmecede kaybolmuyor.
 */
export function ModalSuccessStep({
  title,
  hint,
  children,
}: {
  title: ReactNode;
  hint?: ReactNode;
  /** Devam eylemleri — alt alta, ilk sırada en olası olan. */
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-sm flex-col items-center text-center">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success-fg"
        >
          <Check className="h-6 w-6" />
        </span>
        <h3 className="mt-4 text-base font-semibold text-fg">{title}</h3>
        {hint ? <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{hint}</p> : null}
        {/* Düğmeler `pageActionClasses` ile geliyor ve `inline-flex` oldukları
            için içerikleri sola yaslı kalıyordu; sütun ortalanmış bir kartta
            bu, dört düğmenin metninin ortak bir sol kenara dizilmesi demekti. */}
        <div className="mt-7 flex w-full flex-col gap-2 [&>*]:justify-center">{children}</div>
      </div>
    </div>
  );
}
