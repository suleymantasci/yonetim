"use client";

import { useRouteDrawerClose } from "@/components/route-drawer";
import {
  BankAccountForm,
  type BankAccountFormDefaults,
} from "../../../banka/bank-account-form";

/**
 * Çekmece içindeki banka hesabı ekleme/düzenleme akışı.
 *
 * "Bir tane daha" adımı yok: bir site üç beş hesap tutar, arka arkaya
 * tanımlanan bir kayıt değil. Kayıt bitince çekmece kapanıyor.
 */
export function BankAccountDrawerFlow({
  defaults,
  submitLabel,
}: {
  defaults?: BankAccountFormDefaults;
  submitLabel: string;
}) {
  const close = useRouteDrawerClose();

  return (
    <BankAccountForm
      defaults={defaults}
      submitLabel={submitLabel}
      layout="modal"
      onCancel={close}
      stayOnSuccess
      onSaved={close}
    />
  );
}
