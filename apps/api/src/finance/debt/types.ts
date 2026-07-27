import type {
  DebtAdjust,
  DebtBulkCreate,
  DebtCreate,
  PaymentCollect,
  SHARE_TARGETS,
} from "@yonetim/contracts";

/**
 * Modül içi tip yeniden yayını.
 *
 * Sözleşme tiplerini repository/service dosyalarına tek bir yerden veriyoruz;
 * `@yonetim/contracts` import satırı her dosyada uzamıyor ve ileride bir tip
 * değişirse tek dosyada görünür oluyor.
 */
export type ShareTargetValue = (typeof SHARE_TARGETS)[number];
export type { DebtAdjust, DebtBulkCreate, DebtCreate, PaymentCollect };
