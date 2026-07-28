"use client";

import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import type { ServerAction } from "@/components/form/action-form";
import { UnitForm } from "../../../birimler/unit-form";

/**
 * Çekmece içindeki birim ekleme akışı — UI Faz 2.4.
 *
 * İKİ ADIM, TEK ÇEKMECE. Kayıt başarılı olunca çekmece kapanmıyor; yerine
 * "şimdi ne yapmak istersiniz?" adımı geliyor. Kullanıcının bu noktadaki üç
 * gerçek niyeti karşılanıyor:
 *   · **Bu birime sakin ekle** → sakin çekmecesi, birim ön seçili
 *     (`?birim=`), yine liste kaybolmadan.
 *   · **Bir birim daha ekle** → form sıfırlanır, aynı çekmecede kalınır.
 *   · **Kapat** → listeye dönülür; liste zaten arkada duruyordu.
 *
 * Kayıt sonrası `router.refresh()` (ActionForm yapıyor) arkadaki listeyi
 * tazeliyor: kullanıcı çekmeceyi kapattığında yeni satır orada.
 *
 * `key` ile formun sıfırlanması bilinçli: `<form>.reset()` yalnız DOM
 * değerlerini siler, `useState` ile tutulan arsa payı kipi gibi kontrolleri
 * sıfırlamaz. Anahtarı değiştirmek formu gerçekten baştan kurar.
 */
export function NewUnitFlow({
  action,
  blocks,
  labels,
}: {
  action: ServerAction<{ id: string }>;
  blocks: { id: string; name: string }[];
  labels: {
    submit: string;
    cancel: string;
    createdTitle: string;
    createdHint: string;
    addResident: string;
    addAnother: string;
    openDetail: string;
    done: string;
  };
}) {
  const router = useRouter();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (createdId) {
    return (
      <div className="py-2">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-fg"
          >
            <Check className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-fg">{labels.createdTitle}</h3>
            <p className="mt-1 text-sm text-fg-muted">{labels.createdHint}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href={`/panel/sakinler/yeni?birim=${createdId}`}
            className={pageActionClasses.primary}
          >
            <Plus aria-hidden className="h-4 w-4" />
            {labels.addResident}
          </Link>
          <button
            type="button"
            onClick={() => {
              setCreatedId(null);
              setFormKey((key) => key + 1);
            }}
            className={pageActionClasses.secondary}
          >
            <Plus aria-hidden className="h-4 w-4" />
            {labels.addAnother}
          </button>
          <Link href={`/panel/birimler/${createdId}`} className={pageActionClasses.ghost}>
            {labels.openDetail}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className={pageActionClasses.ghost}
          >
            {labels.done}
          </button>
        </div>
      </div>
    );
  }

  return (
    <UnitForm
      key={formKey}
      action={action}
      blocks={blocks}
      submitLabel={labels.submit}
      stayOnSuccess
      onCreated={(id) => setCreatedId(id)}
    />
  );
}
