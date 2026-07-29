"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import { ModalSuccessStep } from "@/components/form/modal-step";
import { useRouteDrawerClose } from "@/components/route-drawer";
import {
  MaintenanceForm,
  type MaintenanceTemplateOption,
} from "../../../bakim/maintenance-form";

/**
 * Çekmece içindeki bakım planı ekleme akışı.
 *
 * "Detayı aç" yok: bakım kaydının ayrı bir detay sayfası değil, düzenleme
 * sayfası var ve oraya listeden gidiliyor. Yasal şablon listesinden arka
 * arkaya birkaç bakım tanımlamak tipik ilk kurulum işi, o yüzden "bir tane
 * daha" adımı korunuyor.
 */
export function NewMaintenanceFlow({
  templates,
  labels,
}: {
  templates: MaintenanceTemplateOption[];
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
    <MaintenanceForm
      key={formKey}
      templates={templates}
      submitLabel={labels.submit}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onCreated={() => setCreated(true)}
    />
  );
}
