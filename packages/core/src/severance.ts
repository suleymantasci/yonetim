import { roundHalfUp, type Kurus } from "./money";

/**
 * Kıdem ve ihbar tazminatı hesabı — 1475 s.K. md.14 ve 4857 s.K. md.17.
 *
 * NEDEN SAF FONKSİYON VE NEDEN `packages/core`: hesap üç yerde aynı sonucu
 * vermek zorunda — personel ekranındaki hesaplayıcı, çıkış işlemi ve (ileride)
 * bordro dosyası. İkinci bir uygulama yazılırsa "ekranda 84.000 ₺ yazıyordu,
 * bordroda 81.500 ₺ çıktı" tipinde bir uyuşmazlık kaçınılmaz olurdu.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NELER KANUNDA SABİT, NELER PARAMETRE — bu ayrım bilinçli
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Kanunda sabit olanlar bu dosyada **gömülü**:
 *   · kıdemde her tam yıl için 30 günlük giydirilmiş brüt ücret
 *   · kıdem için en az 1 yıl çalışma şartı
 *   · ihbar süreleri (2/4/6/8 hafta) ve eşikleri
 *   · damga vergisi binde 7,59 — her iki tazminatta da
 *   · kıdem tazminatının **gelir vergisinden istisna** olması
 *   · her ikisinin de SGK primine tabi olmaması
 *
 * Yılda bir/iki kez **değişenler parametre**, çünkü kodda sabitlenirlerse
 * sessizce eskirler ve yanlış rakam üretmeye devam ederler:
 *   · kıdem tazminatı tavanı (6 ayda bir, memur emekli ikramiyesine bağlı)
 *   · ihbar tazminatına uygulanacak gelir vergisi oranı (kümülatif matraha
 *     bağlı; çalışanın yıl içi kazancına göre dilim değişir)
 *
 * Varsayılanları `packages/config` içinde **tarih damgasıyla** duruyor.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SONUÇ BİR TAHMİNDİR, BORDRO DEĞİLDİR
 * ─────────────────────────────────────────────────────────────────────────
 * Gelir vergisi gerçekte kümülatif matrahtan hesaplanır; bu fonksiyon tek bir
 * marjinal oran alıyor. Bu yüzden `isEstimate` her zaman `true` dönüyor ve
 * ekran bunu kullanıcıya yazıyor — "yaklaşık" olduğunu söylemeyen bir rakam,
 * işten çıkarma görüşmesinde taahhüt gibi okunur.
 */

/** Damga vergisi oranı — binde 7,59 (488 s.K. eki I sayılı tarife). */
export const STAMP_DUTY_RATE = 0.00759;

/** Kıdem tazminatında bir yıla karşılık gelen gün sayısı (1475 md.14). */
export const SEVERANCE_DAYS_PER_YEAR = 30;

/** Günlük ücret bulunurken kullanılan ay uzunluğu — iş hukuku teamülü. */
const DAYS_IN_MONTH = 30;

const DAY_MS = 86_400_000;
/** Kıdem kesirli yılı gün üzerinden orantılanır. */
const DAYS_IN_YEAR = 365;

/**
 * İhbar süreleri — 4857 md.17.
 *
 * Sınırlar **dahil değil/dahil** ayrımıyla yazıldı: kanun "altı aydan az",
 * "altı aydan bir buçuk yıla kadar" diyor; yani 6 ayı **dolduran** kişi ikinci
 * kademeye geçiyor. `maxMonths` üst sınır ve hariç.
 */
const NOTICE_TIERS = [
  { maxMonths: 6, weeks: 2 },
  { maxMonths: 18, weeks: 4 },
  { maxMonths: 36, weeks: 6 },
  { maxMonths: Infinity, weeks: 8 },
] as const;

export interface SeveranceInput {
  /** İşe giriş. */
  readonly startedAt: Date;
  /** Çıkış (fesih) tarihi. */
  readonly endedAt: Date;
  /**
   * **Giydirilmiş** aylık brüt ücret (kuruş): çıplak ücrete ek olarak yol,
   * yemek, ikramiye gibi süreklilik arz eden ödemelerin aylığa düşen payı.
   * Çıplak ücret verilirse sonuç olması gerekenden düşük çıkar — çağıranın
   * sorumluluğu, çünkü hangi yan hakkın "süreklilik arz ettiği" bir olgu
   * değerlendirmesi ve kod bunu bilemez.
   */
  readonly monthlyGrossMinor: Kurus;
  /** Kıdem tazminatı tavanı (kuruş) — yıllık tutarın üst sınırı. */
  readonly ceilingMinor: Kurus;
  /** İhbar tazminatına uygulanacak gelir vergisi oranı (0–1 arası). */
  readonly incomeTaxRate: number;
  /**
   * İhbar tazminatı doğuyor mu.
   *
   * Doğmadığı hâller var ve bunlar hesapla değil **olguyla** ilgili: işçi
   * kendi istifa etmişse, işveren haklı nedenle derhal feshetmişse (md.25/II)
   * ya da usulüne uygun ihbar öneli kullandırılmışsa ihbar tazminatı ödenmez.
   * Kod bunu türetemez; çağıran söyler.
   */
  readonly noticeApplies: boolean;
  /**
   * Kıdem tazminatı doğuyor mu — aynı gerekçe. İstifa eden işçi (askerlik,
   * emeklilik, evlilik gibi istisnalar dışında) kıdem tazminatı alamaz.
   */
  readonly severanceApplies: boolean;
}

export interface SeveranceComponent {
  /** Brüt tutar (kuruş). */
  readonly grossMinor: Kurus;
  readonly stampDutyMinor: Kurus;
  /** Kıdemde her zaman 0 — gelir vergisinden istisna. */
  readonly incomeTaxMinor: Kurus;
  readonly netMinor: Kurus;
}

export interface SeveranceResult {
  /** Toplam hizmet süresi — gün. */
  readonly serviceDays: number;
  readonly serviceYears: number;
  readonly serviceMonths: number;
  /** Kıdem hesabında kullanılan aylık taban: tavanla sınırlanmış brüt. */
  readonly cappedMonthlyGrossMinor: Kurus;
  /** Ücret tavanı aştığı için hesaba girmeyen aylık kısım (0 ise aşmamış). */
  readonly ceilingExcessMinor: Kurus;
  /** İhbar öneli — hafta. */
  readonly noticeWeeks: number;
  readonly severance: SeveranceComponent;
  readonly notice: SeveranceComponent;
  readonly totalNetMinor: Kurus;
  /**
   * Kıdem 1 yıl şartını sağlamadığı için sıfırlandı mı — ekran bunu ayrıca
   * söylemeli, aksi halde "0 ₺" bir hata gibi okunur.
   */
  readonly belowMinimumService: boolean;
  /** Gelir vergisi tek marjinal oranla hesaplandı; bkz. dosya başlığı. */
  readonly isEstimate: true;
}

const EMPTY_COMPONENT: SeveranceComponent = {
  grossMinor: 0,
  stampDutyMinor: 0,
  incomeTaxMinor: 0,
  netMinor: 0,
};

/** İhbar önelini hizmet süresinden (ay) bulur — 4857 md.17. */
export function noticeWeeksFor(serviceMonths: number): number {
  return NOTICE_TIERS.find((tier) => serviceMonths < tier.maxMonths)!.weeks;
}

export function calculateSeverance(input: SeveranceInput): SeveranceResult {
  const serviceMs = input.endedAt.getTime() - input.startedAt.getTime();
  // Negatif süre bir veri hatası; sıfırlanıyor ki hesap "negatif tazminat"
  // gibi anlamsız bir çıktı üretmesin.
  const serviceDays = Math.max(0, Math.floor(serviceMs / DAY_MS));
  const serviceYears = serviceDays / DAYS_IN_YEAR;
  const serviceMonths = serviceYears * 12;

  const dailyGross = input.monthlyGrossMinor / DAYS_IN_MONTH;

  /*
   * TAVAN **YILLIK TUTARA** UYGULANIR, TOPLAMA DEĞİL.
   *
   * Yaygın hata toplam kıdemi hesaplayıp sonuna tavanı uygulamak. Kanun
   * "her tam yıl için ... tavanı geçemez" diyor: 20 yıl çalışmış ve ücreti
   * tavanın iki katı olan bir işçide toplam tavana kırpılsaydı tazminat
   * gerçek tutarın yirmide birine düşerdi.
   */
  const cappedMonthlyGrossMinor = Math.min(
    input.monthlyGrossMinor,
    input.ceilingMinor,
  );
  const ceilingExcessMinor = Math.max(
    0,
    input.monthlyGrossMinor - input.ceilingMinor,
  );

  const belowMinimumService = serviceDays < DAYS_IN_YEAR;
  const severanceGross =
    input.severanceApplies && !belowMinimumService
      ? roundHalfUp(
          (cappedMonthlyGrossMinor / DAYS_IN_MONTH) *
            SEVERANCE_DAYS_PER_YEAR *
            serviceYears,
        )
      : 0;

  const noticeWeeks = noticeWeeksFor(serviceMonths);
  const noticeGross = input.noticeApplies
    ? roundHalfUp(dailyGross * noticeWeeks * 7)
    : 0;

  // Kıdem: yalnız damga vergisi (gelir vergisi ve SGK istisnası).
  const severance: SeveranceComponent =
    severanceGross > 0
      ? component(severanceGross, 0)
      : EMPTY_COMPONENT;

  // İhbar: damga vergisi **ve** gelir vergisi; SGK primi yok.
  const notice: SeveranceComponent =
    noticeGross > 0
      ? component(noticeGross, input.incomeTaxRate)
      : EMPTY_COMPONENT;

  return {
    serviceDays,
    serviceYears,
    serviceMonths,
    cappedMonthlyGrossMinor,
    ceilingExcessMinor,
    noticeWeeks: input.noticeApplies ? noticeWeeks : 0,
    severance,
    notice,
    totalNetMinor: severance.netMinor + notice.netMinor,
    belowMinimumService,
    isEstimate: true,
  };
}

function component(grossMinor: Kurus, incomeTaxRate: number): SeveranceComponent {
  const stampDutyMinor = roundHalfUp(grossMinor * STAMP_DUTY_RATE);
  const incomeTaxMinor = roundHalfUp(grossMinor * incomeTaxRate);
  return {
    grossMinor,
    stampDutyMinor,
    incomeTaxMinor,
    netMinor: grossMinor - stampDutyMinor - incomeTaxMinor,
  };
}
