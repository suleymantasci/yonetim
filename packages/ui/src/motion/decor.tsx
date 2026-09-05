"use client";

import { useId, type PointerEvent, type ReactNode } from "react";

import { cn } from "../cn";

/**
 * Dekoratif zemin ve imleç etkileşimleri.
 *
 * Hepsi `aria-hidden` veya salt görsel: hiçbiri bilgi taşımaz. Bu kural
 * bilerek katı — bir kullanıcı hareketi kapattığında sayfadan bilgi eksilmesi
 * kabul edilemez, yalnız cila eksilebilir.
 */

/**
 * Yumuşak gradyan zemin. Üç bulanık leke; marka renklerinden türetilir,
 * çok yavaş sürüklenir. `blur` yerine büyük `radial-gradient` kullanıldı:
 * filtre, altındaki metnin alt piksel düzleştirmesini bozuyordu.
 */
export function GradientMesh({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute -left-[20%] -top-[60%] h-[75rem] w-[75rem] rounded-full motion-safe:animate-[gradient-drift_26s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-primary) 42%, transparent) 0%, transparent 58%)",
        }}
      />
      <div
        className="absolute -right-[22%] -top-[45%] h-[62rem] w-[62rem] rounded-full motion-safe:animate-[gradient-drift_34s_ease-in-out_infinite_reverse]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-secondary) 34%, transparent) 0%, transparent 56%)",
        }}
      />
      <div
        className="absolute -bottom-[55%] left-[22%] h-[55rem] w-[55rem] rounded-full motion-safe:animate-[gradient-drift_30s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-accent) 26%, transparent) 0%, transparent 58%)",
        }}
      />
    </div>
  );
}

/**
 * Vaziyet planı ızgarası — pazarlama bantlarının zemini.
 *
 * NEDEN GRADYAN LEKESİ DEĞİL: `GradientMesh` üç bulanık renk lekesidir ve
 * bugün her SaaS açılış sayfasında aynı biçimde duruyor; hiçbir şey anlatmaz,
 * yalnız "modern görünmeye" çalışır. Bu ızgara ise ürünün konusuna ait bir
 * işaret: mimari vaziyet planı kâğıdı. İnce çizgi 32px, kalın çizgi 160px —
 * kâğıt ölçeği gibi iki basamaklı.
 *
 * RENK: `currentColor`. Çağıran taraf `text-border` (açık bant) ya da
 * `text-ink-border` (koyu bant) verir; ızgara temayla birlikte döner ve
 * token dışına çıkmaz.
 *
 * MASKE: Izgara kenarlarda kesilmez, çözünür. Kesilseydi bandın sınırında
 * ikinci bir çizgi oluşur, düzenin gerçek kenarlığıyla yarışırdı.
 *
 * HAREKET YOK: Zemin kaymaz. `gradient-drift` sürekli boyama üretiyordu;
 * burada tek bir statik SVG var, hareket bütçesi ürün gösterimine kalıyor.
 */
export function BlueprintGrid({
  className,
  /** Maskenin odağı — ızgaranın en yoğun olduğu nokta. */
  origin = "top left",
}: {
  className?: string;
  origin?: "top left" | "top right" | "top center";
}) {
  // Aynı sayfada birden fazla bant olabilir; `pattern` kimlikleri çakışırsa
  // ikinci ızgara birincinin desenini boyar.
  const id = useId().replace(/:/g, "");
  const at = origin === "top left" ? "12% 0%" : origin === "top right" ? "88% 0%" : "50% 0%";
  // Maskede yalnız **alfa** okunur; renk kanalı hiç kullanılmaz. Sabit bir
  // siyah yazmak yerine `currentColor`: hem token disiplini bozulmuyor hem de
  // "bu bir renk değil, bir şablon" olduğu okunur kalıyor.
  const mask = `radial-gradient(120% 95% at ${at}, currentColor 0%, currentColor 32%, transparent 78%)`;

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden text-border", className)}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <svg className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`${id}-fine`} width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
          </pattern>
          <pattern id={`${id}-coarse`} width="160" height="160" patternUnits="userSpaceOnUse">
            <path d="M160 0H0V160" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id}-fine)`} />
        <rect width="100%" height="100%" fill={`url(#${id}-coarse)`} />
      </svg>
    </div>
  );
}

/**
 * Izgaranın altına giren tek marka yıkaması.
 *
 * `GradientMesh` üç leke basıyordu; burada tek bir konik olmayan yumuşak geçiş
 * var ve köşeye sabitlenmiş. Amaç renk katmak, "aurora" yapmak değil.
 */
/**
 * Anti-AI-slop: Yapay radyal haze/spotlight kaldırıldı.
 * Yüzey kendi sadeliği ve mimari BlueprintGrid ile nefes alır.
 */
export function BrandWash({ className: _className }: { className?: string } = {}) {
  return null;
}


/**
 * İmleci izleyen yumuşak ışık — kart hover'ı.
 *
 * Konum React state'ine yazılmaz: her fare hareketi bir render tetikler ve
 * 120 Hz'lik bir farede bu tek başına ana iş parçacığını doldurur. Bunun
 * yerine iki CSS özel özelliği doğrudan öğeye yazılıyor; boyama dışında
 * hiçbir iş yapılmıyor.
 *
 * Yalnız ince imleçte (fare) görünür: dokunmatik ekranda "hover" diye bir
 * durum yok, orada ışık parmağın altında kalıp kafa karıştırıyor.
 */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - box.top}px`);
  }

  return (
    <div className={cn("group relative", className)} onPointerMove={handlePointerMove}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [@media(pointer:coarse)]:hidden"
        style={{
          background:
            "radial-gradient(22rem circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), color-mix(in oklab, var(--color-primary) 12%, transparent), transparent 72%)",
        }}
      />
      {children}
    </div>
  );
}
