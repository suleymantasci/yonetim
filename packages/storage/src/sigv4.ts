import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4 — sorgu dizesiyle imzalama (presigned URL).
 *
 * NEDEN SDK YOK: ihtiyacımız iki işlem (nesne yaz, nesne oku) ve ikisi de
 * imzalı URL üretmekten ibaret. `@aws-sdk/client-s3` + presigner bu iş için
 * onlarca megabaytlık bir bağımlılık ağacı getiriyor; imza algoritması ise
 * altmış satır. Depoda aynı tercih iyzico'nun HMAC başlığında da yapıldı.
 *
 * ALGORİTMA (AWS "Authenticating Requests: Using Query Parameters"):
 *   1. Kanonik istek: yöntem, yol, sıralı sorgu, başlıklar, imzalı başlık
 *      listesi ve gövde özeti (`UNSIGNED-PAYLOAD` — gövde imzaya girmiyor,
 *      girseydi tarayıcı yüklemeden önce dosyanın tamamını hash'lemek
 *      zorunda kalırdı).
 *   2. İmzalanacak dize: algoritma, zaman, kapsam, kanonik isteğin özeti.
 *   3. İmzalama anahtarı: gizli anahtardan tarih → bölge → servis → istek
 *      zincirinde türetiliyor. Zincir, sızan bir imzalama anahtarının yalnız
 *      o gün ve o servis için geçerli olmasını sağlıyor.
 */
export interface SignParams {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  /** Şema ve host — örn. `https://<hesap>.r2.cloudflarestorage.com`. */
  endpoint: string;
  /**
   * Host'tan sonraki yol, baştaki bölü olmadan — R2'nin yol biçiminde
   * `<kova>/<anahtar>`. Kova adını ayrı bir alan yapmadık: sanal-host
   * biçiminde (`<kova>.s3.amazonaws.com`) kova zaten host'ta ve yol yalnız
   * anahtardan ibaret. Tek alan iki biçimi de karşılıyor.
   */
  path: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  expiresInSeconds: number;
  /** Test edilebilirlik için dışarıdan verilir; üretimde `new Date()`. */
  now?: Date;
}

const ALGORITHM = "AWS4-HMAC-SHA256";
const SERVICE = "s3";

export function presignUrl(params: SignParams): string {
  const now = params.now ?? new Date();
  const amzDate = `${iso(now)}Z`;
  const dateStamp = amzDate.slice(0, 8);

  const host = new URL(params.endpoint).host;
  const canonicalUri = `/${encodeSegments(params.path)}`;

  const scope = `${dateStamp}/${params.region}/${SERVICE}/aws4_request`;
  /*
   * Sorgu parametreleri **sıralı** olmak zorunda ve sıralama kodlanmış
   * adlara göre. Elle sıraya dizmek yerine `sort()`: yeni bir parametre
   * eklendiğinde sıranın bozulmaması için.
   */
  const query = new Map<string, string>([
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", `${params.accessKeyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(params.expiresInSeconds)],
    ["X-Amz-SignedHeaders", "host"],
  ]);
  const canonicalQuery = [...query.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    ALGORITHM,
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmac(signingKey(params, dateStamp), stringToSign).toString("hex");

  return `${params.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function signingKey(params: SignParams, dateStamp: string): Buffer {
  const kDate = hmac(Buffer.from(`AWS4${params.secretAccessKey}`, "utf8"), dateStamp);
  const kRegion = hmac(kDate, params.region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

function hmac(key: Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** `20260729T173000` — AWS'in beklediği sıkıştırılmış ISO biçimi. */
function iso(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").slice(0, 15);
}

/**
 * RFC 3986 kodlaması.
 *
 * `encodeURIComponent` beş karakteri (`!'()*`) kodlamıyor; AWS onları da
 * bekliyor ve tek karakterlik fark imzayı komple geçersiz kılıyor.
 */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Yol kodlaması: bölü işaretleri **korunuyor**, geri kalan kodlanıyor.
 *
 * Anahtarın içindeki `/` bir dizin ayracı; kodlansaydı nesne adının parçası
 * olurdu ve yüklenen dosya başka bir yere düşerdi.
 */
function encodeSegments(path: string): string {
  return path.split("/").map(rfc3986).join("/");
}
