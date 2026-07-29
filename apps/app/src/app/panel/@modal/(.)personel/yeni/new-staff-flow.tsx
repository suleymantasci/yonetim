"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import { ModalSuccessStep } from "@/components/form/modal-step";
import { useRouteDrawerClose } from "@/components/route-drawer";
import { StaffForm } from "../../../personel/staff-form";

/**
 * Çekmece içindeki personel ekleme akışı — `NewExpenseFlow` ile aynı iki adım.
 *
 * "Detayı aç" bağlantısı **yok**: personelin ayrı bir detay sayfası yok, kayıt
 * listede görünüyor. Var olmayan bir sayfaya düğme koymak yerine adım iki
 * seçenekle kalıyor.
 */
export function NewStaffFlow({
  labels,
}: {
  labels: {
    submit: string;
    createdTitle: string;
    createdHint: string;
    addAnother: string;
    done: string;
  };
}) {
  const close = useRouteDrawerClose();
  const [created, setCreated] = useState(false);
  const [formKey, setFormKey] = useState(0);

  if (created) {
    return (
      <ModalSuccessStep title={labels.createdTitle} hint={labels.createdHint}>
        <button
          type="button"
          onClick={() => {
            setCreated(false);
            setFormKey((key) => key + 1);
          }}
          className={pageActionClasses.primary}
        >
          <Plus aria-hidden className="h-4 w-4" />
          {labels.addAnother}
        </button>
        <button type="button" onClick={close} className={pageActionClasses.ghost}>
          {labels.done}
        </button>
      </ModalSuccessStep>
    );
  }

  return (
    <StaffForm
      key={formKey}
      submitLabel={labels.submit}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onCreated={() => setCreated(true)}
    />
  );
}
