"use client";

import { useState } from "react";
import { Check, CheckCheck, MessageSquare } from "lucide-react";

export function ResidentDemo({ labels }: { labels: { chatPrompt: string; chatReply: string } }) {
  const [chatStep, setChatStep] = useState<"query" | "paid">("query");
  return (
      <div
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
        className="group w-full cursor-pointer rounded-2xl border border-border-strong/40 bg-surface p-3.5 shadow-sm transition-all duration-200 hover:border-primary/50 active:scale-[0.98]"
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
          <div
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
          </div>
        )}
      </div>
  );
}
