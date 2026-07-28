"use client";

import Image from "next/image";
import { ArrowUpRight, Check } from "lucide-react";

import { m } from "@/components/motion";
import { PlotShape } from "@/components/home/plot-shape";

/**
 * Hero görseli — fotoğraf + üstüne binen **canlı** arayüz parçaları.
 *
 * NEDEN İKİSİ BİRDEN: Yalnız fotoğraf kullanmak (sektörün alışkanlığı) ürünün
 * ne yaptığını göstermez; yalnız arayüz mock'u kullanmak (SaaS açılış
 * sayfalarının alışkanlığı) işin kimin işi olduğunu göstermez. Fotoğraf
 * bağlamı ("bunu yöneten bir insan var"), üstüne binen kartlar ürünü anlatır.
 *
 * ÜSTTEKİ KARTLAR EKRAN GÖRÜNTÜSÜ DEĞİL: gerçek token, gerçek tipografi,
 * gerçek yerelleştirme. Tema değişince dönerler, dil değişince çevrilirler.
 * Fotoğrafın içine gömülmüş bir arayüz bunu yapamaz — bu yüzden fotoğraftan
 * istenen tek şey **özne**, arayüz değil (ölçüler: public/images/README.md).
 *
 * ALTLIK ŞEKLİ `PlotShape`ten gelir; gerekçesi orada.
 */

export interface HeroFigureLabels {
  /** Görselin alternatif metni. */
  alt: string;
  collectionRate: string;
  trend: string;
  chatPrompt: string;
  chatReply: string;
}

export function HeroFigure({ labels }: { labels: HeroFigureLabels }) {
  return (
    <div className="relative mx-auto w-full max-w-[32rem] lg:max-w-none">
      <PlotShape />

      {/*
        LCP: hero'nun görsel ağırlığı burada. `priority` ile ön yükleniyor ve
        `sizes` gerçek yerleşimi anlatıyor — masaüstünde sütun ~34rem, mobilde
        neredeyse tam genişlik.
      */}
      <Image
        src="/images/tour-control-slide.png"
        alt={labels.alt}
        width={760}
        height={676}
        priority
        sizes="(min-width: 1024px) 34rem, (min-width: 640px) 32rem, 92vw"
        className="relative w-full"
      />

      {/* Tahsilat rozeti — sağ üst. Fotoğrafın "temiz bölge"si burası. */}
      <m.div
        className="absolute end-0 top-[6%] w-[10.5rem] rounded-xl border border-border bg-surface/95 p-3 shadow-lg shadow-ink/10 backdrop-blur sm:top-[10%]"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-[11px] font-medium text-fg-muted">{labels.collectionRate}</p>
        <p className="mt-0.5 font-heading text-2xl font-bold leading-none tabular-nums text-fg">%94</p>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-success-fg">
          <ArrowUpRight aria-hidden className="h-3 w-3" />
          {labels.trend}
        </p>
      </m.div>

      {/* WhatsApp akışı — sol alt. Ürünün en ayırt edici parçası, en görünür
          köşede duruyor. */}
      <m.div
        className="absolute bottom-[4%] start-0 w-[13.5rem] rounded-xl border border-border bg-surface/95 p-3 shadow-lg shadow-ink/10 backdrop-blur sm:w-[15rem]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="w-fit rounded-2xl rounded-tr-sm bg-primary-soft px-2.5 py-1 text-[11px] text-primary-soft-fg">
          {labels.chatPrompt}
        </p>
        <p className="mt-1.5 ms-auto w-fit rounded-2xl rounded-tl-sm bg-surface-sunken px-2.5 py-1 text-[11px] leading-snug text-fg">
          <Check aria-hidden className="me-1 inline h-3 w-3 text-success" />
          {labels.chatReply}
        </p>
      </m.div>
    </div>
  );
}
