"use client";

import { useState } from "react";
import { Building2, Calculator, MessageSquare, ShieldCheck } from "lucide-react";

export interface MigrationDeskProps {
  labels: {
    tag: string;
    status: string;
    tabApsiyon: string;
    tabExcel: string;
    tabNew: string;
    formatLabel: string;
    timeLabel: string;
    apsiyonFormat: string;
    apsiyonTime: string;
    excelFormat: string;
    excelTime: string;
    newFormat: string;
    newTime: string;
    apsiyonRow1Title: string;
    apsiyonRow1Desc: string;
    apsiyonRow1Badge: string;
    apsiyonRow2Title: string;
    apsiyonRow2Desc: string;
    apsiyonRow2Badge: string;
    apsiyonRow3Title: string;
    apsiyonRow3Desc: string;
    apsiyonRow3Badge: string;
    excelRow1Title: string;
    excelRow1Desc: string;
    excelRow1Badge: string;
    excelRow2Title: string;
    excelRow2Desc: string;
    excelRow2Badge: string;
    excelRow3Title: string;
    excelRow3Desc: string;
    excelRow3Badge: string;
    newRow1Title: string;
    newRow1Desc: string;
    newRow1Badge: string;
    newRow2Title: string;
    newRow2Desc: string;
    newRow2Badge: string;
    newRow3Title: string;
    newRow3Desc: string;
    newRow3Badge: string;
    guaranteeFooter: string;
  };
}

type TabKey = "apsiyon" | "excel" | "new";

export function MigrationDesk({ labels }: MigrationDeskProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("apsiyon");

  const tabData = {
    apsiyon: {
      format: labels.apsiyonFormat,
      time: labels.apsiyonTime,
      rows: [
        {
          icon: Building2,
          title: labels.apsiyonRow1Title,
          desc: labels.apsiyonRow1Desc,
          badge: labels.apsiyonRow1Badge,
          badgeVariant: "success" as const,
        },
        {
          icon: Calculator,
          title: labels.apsiyonRow2Title,
          desc: labels.apsiyonRow2Desc,
          badge: labels.apsiyonRow2Badge,
          badgeVariant: "success" as const,
        },
        {
          icon: MessageSquare,
          title: labels.apsiyonRow3Title,
          desc: labels.apsiyonRow3Desc,
          badge: labels.apsiyonRow3Badge,
          badgeVariant: "primary" as const,
        },
      ],
    },
    excel: {
      format: labels.excelFormat,
      time: labels.excelTime,
      rows: [
        {
          icon: Building2,
          title: labels.excelRow1Title,
          desc: labels.excelRow1Desc,
          badge: labels.excelRow1Badge,
          badgeVariant: "success" as const,
        },
        {
          icon: Calculator,
          title: labels.excelRow2Title,
          desc: labels.excelRow2Desc,
          badge: labels.excelRow2Badge,
          badgeVariant: "success" as const,
        },
        {
          icon: MessageSquare,
          title: labels.excelRow3Title,
          desc: labels.excelRow3Desc,
          badge: labels.excelRow3Badge,
          badgeVariant: "primary" as const,
        },
      ],
    },
    new: {
      format: labels.newFormat,
      time: labels.newTime,
      rows: [
        {
          icon: Building2,
          title: labels.newRow1Title,
          desc: labels.newRow1Desc,
          badge: labels.newRow1Badge,
          badgeVariant: "success" as const,
        },
        {
          icon: Calculator,
          title: labels.newRow2Title,
          desc: labels.newRow2Desc,
          badge: labels.newRow2Badge,
          badgeVariant: "success" as const,
        },
        {
          icon: MessageSquare,
          title: labels.newRow3Title,
          desc: labels.newRow3Desc,
          badge: labels.newRow3Badge,
          badgeVariant: "primary" as const,
        },
      ],
    },
  }[activeTab];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* Üst Bar: Konsol Başlığı ve Canlı Destek Durumu */}
      <div className="flex items-center justify-between border-b border-border bg-surface-sunken/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
            {labels.tag}
          </span>
        </div>
        <span className="font-mono text-xs font-semibold text-fg-muted">
          {labels.status}
        </span>
      </div>

      {/* Kaynak Seçim Sekmeleri */}
      <div
        role="tablist"
        aria-label={labels.tag}
        className="flex items-center gap-1.5 border-b border-border bg-surface-sunken/30 p-2"
      >
        <button
          type="button"
          role="tab"
          id="tab-apsiyon"
          aria-selected={activeTab === "apsiyon"}
          aria-controls="panel-migration"
          onClick={() => setActiveTab("apsiyon")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "apsiyon"
              ? "border border-border bg-surface text-fg shadow-xs"
              : "text-fg-muted hover:bg-hover hover:text-fg"
          }`}
        >
          {labels.tabApsiyon}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-excel"
          aria-selected={activeTab === "excel"}
          aria-controls="panel-migration"
          onClick={() => setActiveTab("excel")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "excel"
              ? "border border-border bg-surface text-fg shadow-xs"
              : "text-fg-muted hover:bg-hover hover:text-fg"
          }`}
        >
          {labels.tabExcel}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-new"
          aria-selected={activeTab === "new"}
          aria-controls="panel-migration"
          onClick={() => setActiveTab("new")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "new"
              ? "border border-border bg-surface text-fg shadow-xs"
              : "text-fg-muted hover:bg-hover hover:text-fg"
          }`}
        >
          {labels.tabNew}
        </button>
      </div>

      {/* Kaynak Meta Bilgi Şeridi */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-surface px-5 py-2.5 text-xs">
        <div className="flex items-center gap-1.5 text-fg-subtle">
          <span className="font-semibold text-fg">{labels.formatLabel}:</span>
          <span>{tabData.format}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-fg-muted">
          <span>{labels.timeLabel}:</span>
          <strong className="text-fg">{tabData.time}</strong>
        </div>
      </div>

      {/* Aktarım ve Doğrulama Satırları */}
      <div
        id="panel-migration"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="divide-y divide-border/60 p-1"
      >
        {tabData.rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.title}
              className="flex items-start justify-between gap-4 p-4 transition-colors hover:bg-hover/40"
            >
              <div className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-primary">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-fg">{row.title}</h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                    {row.desc}
                  </p>
                </div>
              </div>

              <span
                className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${
                  row.badgeVariant === "success"
                    ? "border border-success/30 bg-success-soft text-success-fg"
                    : "border border-primary/30 bg-primary-soft text-primary-soft-fg"
                }`}
              >
                {row.badge}
              </span>
            </div>
          );
        })}
      </div>

      {/* Alt Bilgi & Veri İzolasyon Garantisi */}
      <div className="flex items-center gap-2 border-t border-border bg-surface-sunken/40 px-5 py-3 text-xs text-fg-subtle">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
        <span className="text-[11px] leading-normal">{labels.guaranteeFooter}</span>
      </div>
    </div>
  );
}
