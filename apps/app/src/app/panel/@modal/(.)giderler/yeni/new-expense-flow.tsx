"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "@/components/link";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import { ModalSuccessStep } from "@/components/form/modal-step";
import { useRouteDrawerClose } from "@/components/route-drawer";
import { ExpenseForm } from "../../../giderler/expense-form";

/** Çekmece içindeki gider ekleme akışı — `NewUnitFlow` ile aynı iki adım. */
export function NewExpenseFlow({
  categories,
  bankAccounts,
  canApprove,
  labels,
}: {
  categories: {
    id: string;
    name: string;
    depth: number;
    distribution: string;
    defaultVatRate: string | null;
  }[];
  bankAccounts: { id: string; label: string }[];
  canApprove: boolean;
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
        <Link href={`/panel/giderler/${createdId}`} className={pageActionClasses.secondary}>
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
    <ExpenseForm
      key={formKey}
      categories={categories}
      bankAccounts={bankAccounts}
      canApprove={canApprove}
      submitLabel={labels.submit}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onCreated={(id) => setCreatedId(id)}
    />
  );
}
