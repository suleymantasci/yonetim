"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import { ExpenseForm } from "../../../../giderler/expense-form";

/**
 * Çekmece içindeki gider **düzenleme** akışı.
 *
 * Ekleme çekmecesinin aksine ikinci adım yok: düzeltme bitince yapılacak tek
 * anlamlı şey listeye dönmek, o yüzden çekmece kendiliğinden kapanıyor.
 */
export function EditExpenseFlow({
  categories,
  bankAccounts,
  vendors = [],
  canApprove,
  defaults,
  submitLabel,
}: {
  categories: React.ComponentProps<typeof ExpenseForm>["categories"];
  bankAccounts: React.ComponentProps<typeof ExpenseForm>["bankAccounts"];
  vendors?: { id: string; name: string }[];
  canApprove: boolean;
  defaults: React.ComponentProps<typeof ExpenseForm>["defaults"];
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <ExpenseForm
      categories={categories}
      bankAccounts={bankAccounts}
      vendors={vendors}
      canApprove={canApprove}
      defaults={defaults}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onCreated={close}
    />
  );
}
