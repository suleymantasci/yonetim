"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import { ModalSuccessStep } from "@/components/form/modal-step";
import { useRouteDrawerClose } from "@/components/route-drawer";
import {
  ReservationForm,
  type ReservationResourceOption,
} from "../../../rezervasyon/reservation-form";

/** Çekmece içindeki rezervasyon alma akışı — iki adım. */
export function NewReservationFlow({
  resources,
  residents,
  units,
  labels,
}: {
  resources: ReservationResourceOption[];
  residents: { id: string; name: string }[];
  units: { id: string; number: string; blockName: string | null }[];
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
    <ReservationForm
      key={formKey}
      resources={resources}
      residents={residents}
      units={units}
      submitLabel={labels.submit}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onCreated={() => setCreated(true)}
    />
  );
}
