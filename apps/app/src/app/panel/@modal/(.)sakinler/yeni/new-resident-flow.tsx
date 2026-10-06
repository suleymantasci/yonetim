"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "@/components/link";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import type { ServerAction } from "@/components/form/action-form";
import { ModalSuccessStep } from "@/components/form/modal-step";
import { useRouteDrawerClose } from "@/components/route-drawer";
import { ResidentForm } from "../../../sakinler/resident-form";

/** Çekmece içindeki sakin ekleme akışı — `NewUnitFlow` ile aynı iki adım. */
export function NewResidentFlow({
  action,
  units,
  presetUnitId,
  labels,
}: {
  action: ServerAction<{ id: string }>;
  units: { id: string; number: string; blockName: string | null }[];
  presetUnitId?: string;
  labels: {
    submit: string;
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
        <Link href={`/panel/sakinler/${createdId}`} className={pageActionClasses.secondary}>
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
    <ResidentForm
      key={formKey}
      action={action}
      units={units}
      presetUnitId={presetUnitId}
      submitLabel={labels.submit}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onCreated={(id) => setCreatedId(id)}
    />
  );
}
