"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "@/components/link";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import { ModalSuccessStep } from "@/components/form/modal-step";
import { useRouteDrawerClose } from "@/components/route-drawer";
import { DebtForm } from "../../../borclar/yeni/debt-form";

/**
 * Çekmece içindeki borç girişi akışı.
 *
 * "Bir tane daha" adımı burada özellikle değerli: elle borç girişi çoğu zaman
 * arka arkaya birkaç daire için yapılıyor (tek seferlik gider payı, ceza).
 */
export function NewDebtFlow({
  units,
  presetUnitId,
  defaultPeriod,
  labels,
}: {
  units: { id: string; number: string; blockName: string | null }[];
  presetUnitId?: string;
  defaultPeriod: string;
  labels: {
    createdTitle: string;
    createdHint: string;
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
        <button
          type="button"
          onClick={() => {
            setCreatedId(null);
            setFormKey((key) => key + 1);
          }}
          className={pageActionClasses.primary}
        >
          <Plus aria-hidden className="h-4 w-4" />
          {labels.addAnother}
        </button>
        <Link
          href={`/panel/borclar/${createdId}`}
          className={pageActionClasses.secondary}
        >
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
    <DebtForm
      key={formKey}
      units={units}
      presetUnitId={presetUnitId}
      defaultPeriod={defaultPeriod}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onCreated={(id) => setCreatedId(id)}
    />
  );
}
