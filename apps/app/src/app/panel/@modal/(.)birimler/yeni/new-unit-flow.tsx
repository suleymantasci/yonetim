"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import type { ServerAction } from "@/components/form/action-form";
import { ModalSuccessStep } from "@/components/form/modal-step";
import { useRouteDrawerClose } from "@/components/route-drawer";
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
  const close = useRouteDrawerClose();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (createdId) {
    return (
      <ModalSuccessStep title={labels.createdTitle} hint={labels.createdHint}>
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
        <button type="button" onClick={close} className={pageActionClasses.ghost}>
          {labels.done}
        </button>
      </ModalSuccessStep>
    );
  }

  return (
    <UnitForm
      key={formKey}
      action={action}
      blocks={blocks}
      submitLabel={labels.submit}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onCreated={(id) => setCreatedId(id)}
    />
  );
}
