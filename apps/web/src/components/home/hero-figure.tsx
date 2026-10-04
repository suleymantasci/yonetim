"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Check, CheckCheck, MessageSquare, ShieldCheck } from "lucide-react";

import { m } from "@/components/motion";
import { PlotShape } from "@/components/home/plot-shape";

export interface HeroFigureLabels {
  /** Görselin alternatif metni. */
  alt: string;
  collectionRate: string;
  trend: string;
  chatPrompt: string;
  chatReply: string;
}

export function HeroFigure({ labels }: { labels: HeroFigureLabels }) {
  const [chatStep, setChatStep] = useState<"query" | "paid">("query");

  return (
    <div className="relative mx-auto w-full max-w-[32rem] select-none lg:max-w-none">
      <PlotShape />

      {/* LCP Ana Görsel */}
      <Image
        src="/images/tour-control-slide.png"
        alt={labels.alt}
        width={760}
        height={676}
        priority
        sizes="(min-width: 1024px) 34rem, (min-width: 640px) 32rem, 92vw"
        className="relative w-full drop-shadow-2xl"
      />

      {/* KMK & Mevzuat Güvence Rozeti — Sol Üst */}
      <m.div
        className="absolute start-2 top-[4%] flex items-center gap-2 rounded-xl border border-border-strong/40 bg-surface px-3 py-2 text-xs font-semibold text-fg shadow-md transition-transform hover:scale-105 sm:top-[6%]"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
        <span className="tracking-tight">634 Sayılı KMK Uyumlu</span>
      </m.div>

      {/* Tahsilat rozeti — Sağ Üst */}
      <m.div
        className="absolute end-0 top-[6%] w-[11rem] rounded-2xl border border-border-strong/40 bg-surface p-3.5 shadow-md transition-all hover:border-primary/40 sm:top-[10%]"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-fg-muted">{labels.collectionRate}</p>
          <span className="flex h-2 w-2 rounded-full bg-success" />
        </div>
        <p className="mt-1 font-heading text-3xl font-extrabold leading-none tabular-nums text-fg">%94</p>
        <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-success-fg">
          <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          <span>{labels.trend}</span>
        </p>
      </m.div>

      {/* WhatsApp Canlı Akışı — Sol Alt (Tıklanabilir Demo) */}
      <m.div
        role="button"
        tabIndex={0}
        onClick={() => setChatStep((prev) => (prev === "query" ? "paid" : "query"))}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setChatStep((prev) => (prev === "query" ? "paid" : "query"));
          }
        }}
        title="WhatsApp etkileşimini değiştirmek için tıklayın"
        className="group absolute bottom-[2%] start-0 w-[15.5rem] cursor-pointer rounded-2xl border border-border-strong/40 bg-surface p-3.5 shadow-lg transition-all duration-200 hover:border-primary/50 active:scale-[0.98] sm:w-[17rem]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-2 flex items-center justify-between border-b border-border/60 pb-1.5 text-xs text-fg-subtle">
          <span className="flex items-center gap-1 font-semibold text-fg-muted">
            <MessageSquare aria-hidden="true" className="h-3 w-3 text-success" />
            WhatsApp Sakin Botu
          </span>
          <span className="text-xs font-semibold text-primary group-hover:underline">
            {chatStep === "query" ? "Tıkla: Öde" : "Tıkla: Sıfırla"}
          </span>
        </div>

        {chatStep === "query" ? (
          <div className="space-y-2">
            <div className="ms-auto w-fit rounded-lg rounded-tr-none bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg">
              {labels.chatPrompt}
            </div>
            <div className="w-fit rounded-lg rounded-tl-none bg-surface-sunken p-3">
              <p className="block text-xs font-bold text-primary">Daire 14 Bakiye: 1.500 ₺</p>
              <p className="mt-1 block text-xs leading-snug text-fg-muted">3D Secure ile kartla ödemek için tıklayın</p>
            </div>
          </div>
        ) : (
          <m.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-2"
          >
            <div className="w-fit rounded-lg rounded-tl-none bg-success-soft p-3 text-xs text-success-fg">
              <div className="flex items-center gap-1 font-bold">
                <Check className="h-3.5 w-3.5" />
                <span>1.500 ₺ Tahsil Edildi</span>
              </div>
              <p className="mt-1 block text-[11px] leading-snug">Bakiyeniz: 0,00 ₺ · Makbuz SMS ile iletildi</p>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-fg-subtle">
              <CheckCheck className="h-3.5 w-3.5 text-success" />
              <span>Otomatik banka mutabakatı yapıldı</span>
            </div>
          </m.div>
        )}
      </m.div>


    </div>
  );
}

