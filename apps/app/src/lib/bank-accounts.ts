import { bankOverviewResponse } from "@yonetim/contracts";

import { apiGet } from "./api/server";

/**
 * Tahsilat ve gider formlarındaki "para hangi hesaptan/hesaba" seçimi.
 *
 * NEDEN ORTAK: aynı liste beş ekrandan besleniyor (borç detayı, sakin detayı,
 * birim detayı, gider ekle/düzenle) ve her biri kendi kopyasını tutunca
 * etiket biçimi ile "kapalı hesap ne olacak" kuralı birbirinden ayrışıyordu.
 *
 * `bank:read` YETKİSİ ZORUNLU DEĞİL: gider girebilen ama banka modülünü
 * görmeyen bir kullanıcı kaydını yine de tamamlayabilmeli. Yetki yoksa liste
 * boş dönüyor, form da alanı hiç sormuyor — kayıt nakit kasaya yazılıyor.
 */
export interface BankAccountOption {
  id: string;
  label: string;
}

export async function getBankAccountOptions(
  /**
   * Düzenlenen kaydın bağlı olduğu hesap. Hesap kapatılmış olsa da seçenek
   * olarak kalır; aksi hâlde form sessizce "nakit"e düşer ve dokunulmamış bir
   * alan kaydederken bozulur.
   */
  keepId?: string | null,
): Promise<BankAccountOption[]> {
  const bank = await apiGet("/v1/panel/bank", bankOverviewResponse).catch(
    () => null,
  );

  return (bank?.accounts ?? [])
    .filter((account) => account.isActive || account.id === keepId)
    .map((account) => ({
      id: account.id,
      label: [account.bankName, account.ibanMasked]
        .filter(Boolean)
        .join(" · "),
    }));
}
