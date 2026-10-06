import Image from "next/image";
import { Check } from "lucide-react";
/**
 * Görsel + metin şeridi; sırası satır satır değişir (zikzak).
 *
 * NEDEN IZGARA DEĞİL: Sayfada zaten üç ızgara var (modüller, fiyat, SSS).
 * Dördüncüsü bir doku hâline geliyor ve içinde ne yazdığı okunmuyordu. Zikzak
 * her satırda okuma yönünü değiştirdiği için göz duruyor; ayrıca her satıra
 * tam genişlikte bir görsel alanı açıyor — sektörün yaptığı da bu, ama burada
 * mimari fotoğraflar ortak yaşam bağlamını kuruyor.
 *
 * SUNUCU BİLEŞENİ: Etkileşim yok, JavaScript yok. Görsel `priority` değil —
 * ilk ekranın altında, `loading="lazy"` (Next varsayılanı) doğru davranış.
 *
 * GÖRSEL SÖZLEŞMESİ: Dolu zeminli özgün WebP fotoğraf, 3:4 kırpma.
 * Ölçüler ve güvenli alanlar: `apps/web/public/images/README.md`.
 */

export interface StoryRowProps {
  eyebrow: string;
  title: string;
  body: string;
  /** En fazla dört madde; daha fazlası satırın dengesini bozuyor. */
  points: string[];
  image: { src: string; alt: string };
  /** `true` ise görsel sağda kalır (varsayılan: solda). */
  reverse?: boolean;
}

export function StoryRow({ eyebrow: _eyebrow, title, body, points, image, reverse = false }: StoryRowProps) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      {/*
        Görsel DOM'da her zaman metinden önce gelir; sıra `lg:order-*` ile
        değişir. Ekran okuyucu ve klavye için sıra sabit kalsın diye böyle:
        satırların bazısında görsel önce bazısında sonra okunsaydı, aynı
        kalıbın tekrar ettiği anlaşılmazdı.
      */}
      <div className={"relative" + (reverse ? " lg:order-2" : "")}>
        <div className="relative mx-auto w-full max-w-[30rem] lg:max-w-none">

          <Image
            src={image.src}
            alt={image.alt}
            width={1536}
            height={1024}
            sizes="(min-width: 1024px) 30rem, 88vw"
            className="relative aspect-[4/3] w-full object-cover"
          />
        </div>
      </div>

      <div className={reverse ? "lg:order-1" : undefined}>
        <h3 className="font-heading text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">
          {title}
        </h3>
        <p className="mt-4 max-w-prose leading-relaxed text-fg-muted">{body}</p>
        <ul className="mt-6 space-y-2.5">
          {points.map((point) => (
            <li key={point} className="flex gap-2.5 text-sm text-fg">
              <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
