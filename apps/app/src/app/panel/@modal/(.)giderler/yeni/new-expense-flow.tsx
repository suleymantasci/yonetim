"use client";

import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { pageActionClasses } from "@yonetim/ui";

import { ExpenseForm } from "../../../giderler/expense-form";

/** Çekmece içindeki gider ekleme akışı — `NewUnitFlow` ile aynı iki adım. */
export function NewExpenseFlow({
  categories,
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
          <button type="button" onClick={() => router.back()} className={pageActionClasses.ghost}>
            {labels.done}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ExpenseForm
      key={formKey}
      categories={categories}
      canApprove={canApprove}
      submitLabel={labels.submit}
      stayOnSuccess
      onCreated={(id) => setCreatedId(id)}
    />
  );
}
