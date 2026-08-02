import { randomUUID } from "node:crypto";

import { serverEnv } from "@yonetim/config";

import { presignUrl } from "./sigv4";

export { presignUrl, rfc3986 } from "./sigv4";

/**
 * Nesne deposu — Cloudflare R2 (S3 uyumlu), MIMARI-PLAN §8.3.
 *
 * DOSYA SUNUCUMUZDAN GEÇMİYOR. Tarayıcı imzalı bir URL ile doğrudan R2'ye
 * yazıyor; API yalnız imzayı üretiyor. Alternatifi — dosyayı API'ye yükleyip
 * oradan R2'ye aktarmak — her yüklemede iki kat bant genişliği, istek başına
 * onlarca megabayt bellek ve Node sürecinde uzun süren bir akış demekti.
 *
 * KOVA GİZLİ. Okuma da imzalı ve kısa ömürlü URL ile: `documents.visibility`
 * alanı ("managers" / "residents" / "owners") ancak böyle bir anlam taşıyor.
 * Herkese açık bir kovada, adresi bir kez öğrenen herkes yönetim planını,
 * sözleşmeleri ve kimlik fotokopilerini süresiz okuyabilirdi.
 */
export interface StorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

/**
 * Yapılandırma eksikse `null` — hata değil **durum**.
 *
 * Ödeme komisyonundaki desenin aynısı: kurulu olmayan bir entegrasyon,
 * ekranda "şu an kullanılamıyor" olarak görünüyor. Fırlatmak, R2 kurulmamış
 * bir geliştirme ortamında belgeler sayfasını hiç açılmaz yapardı.
 */
export function storageConfig(): StorageConfig | null {
  const c = serverEnv.storage();
  if (!c.accountId || !c.accessKeyId || !c.secretAccessKey || !c.bucket) {
    return null;
  }
  return {
    endpoint: `https://${c.accountId}.r2.cloudflarestorage.com`,
    bucket: c.bucket,
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    // R2'de bölge kavramı yok ama imza kapsamı bir bölge adı istiyor; S3
    // uyumluluğu için sabit `auto`.
    region: "auto",
  };
}

export function isStorageConfigured(): boolean {
  return storageConfig() !== null;
}

/** Yükleme URL'si kısa ömürlü: sızan bir adres saatlerce yazılabilir olmasın. */
const UPLOAD_TTL_SECONDS = 10 * 60;
/** Okuma daha da kısa: adres paylaşılsa bile kullanılabilir kalmasın. */
const DOWNLOAD_TTL_SECONDS = 5 * 60;

function sign(
  config: StorageConfig,
  method: "GET" | "PUT" | "HEAD" | "DELETE",
  key: string,
  expiresInSeconds: number,
): string {
  return presignUrl({
    method,
    endpoint: config.endpoint,
    path: `${config.bucket}/${key}`,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    expiresInSeconds,
  });
}

export function presignUpload(config: StorageConfig, key: string): {
  url: string;
  expiresInSeconds: number;
} {
  return {
    url: sign(config, "PUT", key, UPLOAD_TTL_SECONDS),
    expiresInSeconds: UPLOAD_TTL_SECONDS,
  };
}

/**
 * M-49: Content-Disposition: attachment + server-side response-content-type
 * ile imzala. Browser içerik inline render etmesin; MIME client-supplied
 * metadata'dan değil, sunucu tarafından geçersiz kılınsın.
 */
export function presignDownload(
  config: StorageConfig,
  key: string,
  opts: { fileName?: string; mime?: string } = {},
): string {
  const params = new URLSearchParams();
  if (opts.fileName) {
    params.set(
      "response-content-disposition",
      `attachment; filename="${encodeURIComponent(opts.fileName)}"`,
    );
  }
  if (opts.mime) {
    params.set("response-content-type", opts.mime);
  }
  const extra = params.toString();
  return extra
    ? sign(config, "GET", key, DOWNLOAD_TTL_SECONDS) + "&" + extra
    : sign(config, "GET", key, DOWNLOAD_TTL_SECONDS);
}

/**
 * Yüklenen nesnenin gerçek boyutu ve türü.
 *
 * NEDEN GEREKLİ: imza gövdeyi kapsamıyor (`UNSIGNED-PAYLOAD`), dolayısıyla
 * istemcinin "bu dosya 2 MB ve PDF" beyanı imzalı URL'yi elde ettikten sonra
 * hiçbir şeyi bağlamıyor — 400 MB'lık bir dosya da yüklenebilir. Kayıt
 * açılmadan önce nesneye bakmak, sınırın tek gerçek uygulandığı yer.
 */
export async function headObject(
  config: StorageConfig,
  key: string,
): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  const res = await fetch(sign(config, "HEAD", key, DOWNLOAD_TTL_SECONDS), {
    method: "HEAD",
  });
  if (!res.ok) return null;

  const length = Number(res.headers.get("content-length") ?? "0");
  return {
    sizeBytes: Number.isFinite(length) ? length : 0,
    contentType: res.headers.get("content-type"),
  };
}

/** Kuralı çiğneyen yükleme depoda bırakılmıyor: ödediğimiz yer orası. */
export async function deleteObject(
  config: StorageConfig,
  key: string,
): Promise<boolean> {
  const res = await fetch(sign(config, "DELETE", key, DOWNLOAD_TTL_SECONDS), {
    method: "DELETE",
  });
  return res.ok;
}

/**
 * Nesne anahtarı — `<tenant>/<yıl>/<uuid>.<uzantı>`.
 *
 * DOSYA ADI ANAHTARA GİRMİYOR. Kullanıcının verdiği ad hem çakışır ("fatura.pdf"
 * her ay bir kez) hem de anahtarı tahmin edilebilir yapar; asıl ad kayıtta
 * (`documents.title`) zaten duruyor. Tenant öneki ise depoyu okurken bile
 * hangi sitenin dosyası olduğunu görünür kılıyor.
 */
export function objectKey(tenantId: string, fileName: string): string {
  const extension = fileExtension(fileName);
  return `${tenantId}/${new Date().getFullYear()}/${randomUUID()}${extension}`;
}

function fileExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]{1,8})$/.exec(fileName.trim());
  return match ? `.${match[1]!.toLowerCase()}` : "";
}

/**
 * M-50: MIME ↔ extension allowlist. Yalnız bu eşleşmeler kabul edilir;
 * declared MIME ile uzantı uyuşmazsa reddedilir. `.html` + `application/pdf`
 * gibi tutarsız kombinasyonlar XSS tetikleyebilir.
 */
const MIME_TO_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/gif": [".gif"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
};

export function isMimeExtensionMatch(
  mime: string | null | undefined,
  fileName: string,
): boolean {
  if (!mime) return false;
  const base = mime.split(";")[0]!.trim().toLowerCase();
  const allowed = MIME_TO_EXTENSIONS[base];
  if (!allowed) return false;
  const ext = fileExtension(fileName);
  return allowed.includes(ext);
}

/**
 * Kabul edilen türler ve üst sınır.
 *
 * Liste **beyaz liste**: kara liste, yarın çıkacak bir çalıştırılabilir türü
 * kaçırırdı. HTML ve SVG bilerek yok — ikisi de script taşıyabiliyor ve
 * imzalı da olsa kendi alan adımızdan servis edilen bir HTML, oturum
 * çerezine erişen bir sayfa demek.
 */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
] as const;

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export function isAllowedMimeType(value: string | null | undefined): boolean {
  if (!value) return false;
  // `; charset=utf-8` gibi ekler türün parçası değil.
  const base = value.split(";")[0]!.trim().toLowerCase();
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(base);
}

/**
 * H-15: Magic bytes (dosya imzası) tespiti. Client-supplied Content-Type'a
 * güvenmek yerine nesnenin ilk 4096 byte'ını çekip imzayı kontrol ediyoruz.
 * Basit signature map; PDF, JPEG, PNG, ZIP tabanlı Office formatları kapsar.
 */
const MAGIC_SIGNATURES: ReadonlyArray<{
  mime: string;
  bytes: readonly number[];
}> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF...WEBP
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // ZIP tabanlı: docx, xlsx, pptx — ilk 4 byte PK\x03\x04
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
];

export async function detectContentType(
  config: StorageConfig,
  key: string,
): Promise<string | null> {
  // Range header ile ilk 4096 byte'ı çek.
  const url = sign(config, "GET", key, DOWNLOAD_TTL_SECONDS);
  const res = await fetch(url, {
    method: "GET",
    headers: { Range: "bytes=0-4095" },
  });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.bytes.length > buf.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buf[i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mime;
  }
  return null;
}
