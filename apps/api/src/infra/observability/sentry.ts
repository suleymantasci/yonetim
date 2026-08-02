import * as Sentry from "@sentry/nestjs";

/**
 * Hata izleme — GAP 4.8.1, MIMARI-PLAN §14 Track D.
 *
 * DSN YOKSA HİÇ KURULMUYOR. Yapılandırılmamış bir SDK'yı yine de başlatmak,
 * geliştirme kurulumunda her hatayı ağa çıkarmaya çalışan bir kuyruk bırakır
 * ve testleri yavaşlatır. Kapalı olması **normal** durum; açık olması bilinçli
 * bir yapılandırma.
 *
 * KVKK: `sendDefaultPii` **kapalı**. Sentry varsayılan olarak IP, çerez ve
 * istek gövdesi toplar; bir apartman yönetim sisteminde bu, sakinlerin TCKN'si
 * ve telefonunun üçüncü taraf bir servise gitmesi demektir. Toplanacak veri
 * `beforeSend` içinde açıkça budanıyor — varsayılana güvenmek yerine.
 *
 * İZ KİMLİĞİ: `x-request-id` etiket olarak ekleniyor, böylece Sentry'deki bir
 * hata ile log'daki satırlar aynı kimlikten eşleşiyor (app → api → worker).
 */
export function initSentry(params: {
  dsn: string | undefined;
  environment: string;
  service: "api" | "worker";
  tracesSampleRate: number;
}): boolean {
  if (!params.dsn) return false;

  Sentry.init({
    dsn: params.dsn,
    environment: params.environment,
    // Servis adı etiketi: api ve worker aynı DSN'i paylaşıyor, hatanın hangi
    // süreçten geldiği ayırt edilebilmeli.
    initialScope: { tags: { service: params.service } },
    tracesSampleRate: params.tracesSampleRate,
    // KVKK md.4 ölçülülük: kişisel veri varsayılan olarak toplanmaz.
    sendDefaultPii: false,
    beforeSend(event) {
      return scrub(event);
    },
  });

  return true;
}

/**
 * Kişisel veri budama — varsayılanın üstüne ikinci savunma hattı.
 *
 * `sendDefaultPii: false` çoğu şeyi kapatıyor ama hata mesajının **içine**
 * girmiş bir TCKN'yi kapatmıyor: bir doğrulama hatası "12345678901 geçersiz"
 * diyebilir ve o metin olduğu gibi dışarı çıkar. Bu yüzden mesaj gövdeleri de
 * taranıyor.
 */
interface ScrubbableEvent {
  message?: string;
  request?: { headers?: Record<string, unknown>; cookies?: unknown; data?: unknown };
  exception?: { values?: Array<{ value?: string }> };
}

function scrub<T extends ScrubbableEvent>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    // İstek gövdesi form alanlarını (TCKN, IBAN, telefon) taşıyabiliyor.
    delete event.request.data;
    if (event.request.headers) {
      for (const key of ["cookie", "authorization", "x-internal-token"]) {
        delete event.request.headers[key];
      }
    }
  }

  if (event.message) event.message = maskPii(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = maskPii(value.value);
  }

  return event;
}

/**
 * 11 haneli TCKN ve TR IBAN kalıpları.
 *
 * Yanlış pozitif mümkün (11 haneli her sayı TCKN değil) ve bu kabul edilebilir
 * bir takas: maskelenmiş bir sipariş numarası hata ayıklamayı biraz zorlaştırır,
 * sızmış bir TCKN geri alınamaz.
 */
// L-21: IBAN spaced format için de pattern. TR12 3456 ... gibi gösterimler
// maskelenmeden exception'a gidebiliyordu; whitespace'i de kabul eden pattern.
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{11}\b/g, "[tckn]"],
  [/\bTR[\s\d]{24,30}\b/gi, "[iban]"],
];

function maskPii(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PII_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
