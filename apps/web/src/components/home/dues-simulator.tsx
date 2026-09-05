"use client";

import { useId, useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { formatAmount } from "@yonetim/i18n";
import { m } from "@/components/motion";

interface DuesSimulatorProps {
  locale: string;
}

const PRESETS = [
  { label: "Apartman (16 Daire)", units: 16, dues: 1250 },
  { label: "Butik Site (40 Daire)", units: 40, dues: 1750 },
  { label: "Toplu Konut (96 Daire)", units: 96, dues: 2200 },
];

export function DuesSimulator({ locale }: DuesSimulatorProps) {
  const [units, setUnits] = useState(36);
  const [dues, setDues] = useState(1500);

  const unitsSliderId = useId();
  const duesSliderId = useId();

  // Finansal projeksiyon hesabı
  const monthlyTotal = units * dues;
  const yearlyTotal = monthlyTotal * 12;

  // Klasik yöntemde ortalama tahsilat oranı %70-74 civarındadır
  const manualCollectionRate = 0.72;
  // WhatsApp botu + kartlı online ödeme ile tahsilat oranı %94-96'ya çıkar
  const automatedCollectionRate = 0.95;

  const monthlyRecovered = Math.round(monthlyTotal * (automatedCollectionRate - manualCollectionRate));
  const yearlyRecovered = monthlyRecovered * 12;

  // Yöneticinin telefon, mesaj ve makbuz takibinden kurtardığı tahmini operasyonel süre (daire başı ~25 dk/ay)
  const savedHoursPerMonth = Math.max(4, Math.round((units * 25) / 60));

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-heading text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Kasanıza ve Vaktinize Katkısını Canlı Hesaplayın
          </h3>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg-muted">
            Daire sayınızı ve ortalama aidatınızı belirleyin; otomatik WhatsApp hatırlatmaları ve kartla ödemenin kasanıza sağlayacağı ek nakit akışını görün.
          </p>
        </div>

        {/* Hızlı Preset Butonları */}
        <div className="flex flex-wrap gap-2 pt-2 sm:pt-0">
          {PRESETS.map((preset) => {
            const isSelected = units === preset.units && dues === preset.dues;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setUnits(preset.units);
                  setDues(preset.dues);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-primary text-primary-fg shadow-sm"
                    : "bg-surface-sunken text-fg-muted hover:bg-hover hover:text-fg active:scale-[0.98]"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8 grid gap-8 border-t border-border pt-8 lg:grid-cols-12 lg:gap-12">
        {/* Sol Kolon: Kaydırıcılar (Düz, ferah yerleşim) */}
        <div className="space-y-7 lg:col-span-6">
          {/* Daire Sayısı Kaydırıcısı */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor={unitsSliderId} className="text-sm font-semibold text-fg">
                Daire Sayısı
              </label>
              <span className="font-heading text-2xl font-bold tabular-nums text-primary">
                {units} <span className="text-xs font-normal text-fg-muted">bağımsız bölüm</span>
              </span>
            </div>
            <input
              id={unitsSliderId}
              type="range"
              min={8}
              max={250}
              step={2}
              value={units}
              onChange={(e) => setUnits(Number(e.target.value))}
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-border accent-primary"
            />
            <div className="flex justify-between text-xs text-fg-subtle">
              <span>8 Daire</span>
              <span>120 Daire</span>
              <span>250 Daire</span>
            </div>
          </div>

          {/* Daire Başı Aidat Kaydırıcısı */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor={duesSliderId} className="text-sm font-semibold text-fg">
                Ortalama Aylık Aidat
              </label>
              <span className="font-heading text-2xl font-bold tabular-nums text-primary">
                {formatAmount(dues, locale)}
              </span>
            </div>
            <input
              id={duesSliderId}
              type="range"
              min={250}
              max={7500}
              step={50}
              value={dues}
              onChange={(e) => setDues(Number(e.target.value))}
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-border accent-primary"
            />
            <div className="flex justify-between text-xs text-fg-subtle">
              <span>250 ₺</span>
              <span>3.500 ₺</span>
              <span>7.500 ₺</span>
            </div>
          </div>

          {/* Kanuni & Sistem Güvence Notu (Düz zemin, nested border yok) */}
          <div className="flex items-start gap-3 rounded-xl bg-surface-sunken p-4 text-xs text-fg-muted">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="max-w-prose leading-relaxed">
              <strong>634 sayılı KMK Madde 20 uyumlu:</strong> Geciken aidatlara aylık yasal gecikme tazminatı (%5)
              otomatik işletilir. Sakinler borcunu WhatsApp'tan tek mesajla sorgulayıp 3D Secure ile anında öder.
            </p>
          </div>
        </div>

        {/* Sağ Kolon: Düz Mizan ve Sonuç Paneli (Nested border yok, saç teli ayraçlar) */}
        <div className="divide-y divide-border rounded-xl bg-surface-sunken/80 lg:col-span-6">
          <div className="grid grid-cols-2 divide-x divide-border p-5">
            <div className="pe-5">
              <p className="text-xs font-medium text-fg-muted">Aylık Tahakkuk Hacmi</p>
              <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-fg">
                {formatAmount(monthlyTotal, locale)}
              </p>
              <p className="mt-1 text-xs text-fg-subtle">
                Yılda {formatAmount(yearlyTotal, locale)} bütçe
              </p>
            </div>

            <div className="ps-5">
              <p className="text-xs font-medium text-fg-muted">Tahsilat Hızı</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-sm font-semibold line-through text-fg-subtle">%72</span>
                <span className="font-heading text-2xl font-bold tabular-nums text-success">
                  %95
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs font-medium text-success">
                <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
                <span>+%23 düzenli akış</span>
              </p>
            </div>
          </div>

          {/* Vurgulu Satır: Zamanında Tahsil Edilen Bütçe */}
          <div className="p-5">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              <span>Kasanıza Zamanında Giren İlave Bütçe</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="font-heading text-3xl font-extrabold tabular-nums text-fg sm:text-4xl">
                {formatAmount(yearlyRecovered, locale)}
              </span>
              <span className="text-sm font-medium text-fg-muted">/ yıl düzenli nakit</span>
            </div>
            <p className="mt-2 max-w-prose text-xs leading-relaxed text-fg-muted">
              Sakinlerin WhatsApp üzerinden tek tıkla kartla ödemesi sayesinde gecikmeler önlenir,
              yönetimin aidat toplama stresi sona erer.
            </p>
          </div>

          {/* Alt Bilgi: Operasyonel Zaman Tasarrufu */}
          <div className="flex items-center justify-between p-5 text-xs">
            <div className="flex items-center gap-2 text-fg">
              <Clock aria-hidden="true" className="h-4 w-4 text-primary" />
              <span>Yöneticinin kazandığı serbest zaman:</span>
            </div>
            <span className="font-heading font-bold tabular-nums text-fg">
              ~{savedHoursPerMonth} saat / ay
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
