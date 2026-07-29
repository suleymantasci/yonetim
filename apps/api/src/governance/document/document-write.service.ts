import { Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type {
  DocumentCreate,
  DocumentDownloadResult,
  DocumentUploadUrlRequest,
  DocumentUploadUrlResult,
} from "@yonetim/contracts";
import { errors } from "@yonetim/core";
import { documents } from "@yonetim/db";
import {
  deleteObject,
  headObject,
  isAllowedMimeType,
  MAX_UPLOAD_BYTES,
  objectKey,
  presignDownload,
  presignUpload,
  storageConfig,
} from "@yonetim/storage";

import { AuditService } from "../audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * Belge yükleme ve indirme — MIMARI-PLAN §8.3.
 *
 * DOSYA API'DEN GEÇMİYOR: tarayıcı imzalı bir adresle doğrudan R2'ye yazıyor.
 * Bunun bedeli, imzanın gövdeyi kapsamaması (`UNSIGNED-PAYLOAD`): istemcinin
 * "2 MB, PDF" beyanı imzalı adresi aldıktan sonra hiçbir şeyi bağlamıyor.
 * Bu yüzden **kayıt açılmadan önce nesneye bakılıyor** (`headObject`) ve
 * kuralı çiğneyen dosya depodan siliniyor. Beyana güvenilseydi, sınır ancak
 * fatura geldiğinde fark edilirdi.
 *
 * ANAHTAR SAKLANIYOR, ADRES DEĞİL. `documents.url` kolonuna nesne anahtarı
 * yazılıyor; indirme adresi her istekte yeniden imzalanıyor ve dakikalar
 * içinde ölüyor. Kalıcı bir adres saklamak, kovayı herkese açmakla aynı
 * kapıya çıkardı — bir kez sızan adres süresiz okunurdu.
 */
@Injectable()
export class DocumentWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  uploadUrl(dto: DocumentUploadUrlRequest): DocumentUploadUrlResult {
    const config = storageConfig();
    if (!config) throw errors.validation("storage_not_configured");

    // Ön kontrol: kullanıcıya 20 MB'lık bir yüklemenin sonunda değil,
    // başında hayır demek. Bağlayıcı kontrol yükleme sonrasında.
    if (!isAllowedMimeType(dto.contentType)) {
      throw errors.validation("unsupported_file_type");
    }
    if (dto.sizeBytes > MAX_UPLOAD_BYTES) {
      throw errors.validation("file_too_large");
    }

    const key = objectKey(this.db.ctx().tenantId, dto.fileName);
    const { url, expiresInSeconds } = presignUpload(config, key);
    return { key, uploadUrl: url, expiresInSeconds };
  }

  async create(dto: DocumentCreate): Promise<{ id: string }> {
    const config = storageConfig();
    if (!config) throw errors.validation("storage_not_configured");

    const ctx = this.db.ctx();

    /*
     * ANAHTAR BU SİTENİN ÖNEKİYLE BAŞLAMAK ZORUNDA. İstemci anahtarı geri
     * gönderiyor; kontrol edilmeseydi bir yönetici başka bir sitenin
     * nesnesinin anahtarını yazıp o dosyayı kendi belgeleri arasına
     * ekleyebilirdi — ve indirme ucu onu seve seve imzalardı.
     */
    if (!dto.key.startsWith(`${ctx.tenantId}/`)) {
      throw errors.validation("invalid_key");
    }

    const object = await headObject(config, dto.key);
    if (!object) throw errors.validation("upload_missing");

    if (object.sizeBytes > MAX_UPLOAD_BYTES || !isAllowedMimeType(object.contentType)) {
      // Kuralı çiğneyen dosya depoda bırakılmıyor: yer bizim, fatura bizim.
      await deleteObject(config, dto.key);
      throw errors.validation(
        object.sizeBytes > MAX_UPLOAD_BYTES ? "file_too_large" : "unsupported_file_type",
      );
    }

    const [row] = await this.db.tx(async (tx) =>
      tx
        .insert(documents)
        .values({
          tenantId: ctx.tenantId,
          category: dto.category,
          title: dto.title,
          description: dto.description ?? null,
          url: dto.key,
          mimeType: object.contentType,
          sizeBytes: object.sizeBytes,
          visibility: dto.visibility,
          expiresAt: dto.expiresAt ?? null,
          uploadedBy: ctx.userId ?? null,
          // Arama vektörü başlık ve açıklamadan: dosyanın içeriğini
          // indekslemek ayrı bir iş (§6.10) ve burada söz vermiyoruz.
          searchText: [dto.title, dto.description].filter(Boolean).join(" "),
        })
        .returning({ id: documents.id }),
    );

    await this.audit.record({
      action: "document.created",
      resource: "document",
      resourceId: row!.id,
      reason: dto.title,
    });

    return { id: row!.id };
  }

  /**
   * İndirme adresi — her istekte yeniden imzalanıyor.
   *
   * ERİŞİM KÜTÜĞE YAZILIYOR: belgeler arasında kimlik fotokopisi ve sözleşme
   * var; "kim ne zaman indirdi" sorusunun cevabının olmaması, KVKK karşısında
   * savunulabilir değil.
   */
  async downloadUrl(id: string): Promise<DocumentDownloadResult> {
    const config = storageConfig();
    if (!config) throw errors.validation("storage_not_configured");

    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select({ url: documents.url, title: documents.title })
        .from(documents)
        .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!row) throw new NotFoundException("not_found");

    /*
     * Eski kayıtlar dış bağlantı taşıyor (depo yokken elle girilmiş URL'ler).
     * Onları imzalamaya çalışmak anlamsız: adres zaten bizim değil, olduğu
     * gibi dönüyor.
     */
    if (/^https?:\/\//i.test(row.url)) {
      return { url: row.url, expiresInSeconds: 0 };
    }

    await this.audit.record({
      action: "document.downloaded",
      resource: "document",
      resourceId: id,
      reason: row.title,
    });

    return { url: presignDownload(config, row.url), expiresInSeconds: 300 };
  }

  /**
   * Belge kaldırma — kayıt **yumuşak** siliniyor, nesne de depodan siliniyor.
   *
   * Kaydı bırakıp nesneyi silmek, listede duran ama açılmayan bir satır
   * bırakırdı; nesneyi bırakıp kaydı silmek ise sonsuza kadar ödenen bir
   * depolama faturası. Sıra önemli: önce kayıt, sonra nesne — nesne silinip
   * kayıt silinemezse ortada açılmayan bir satır kalırdı.
   */
  async remove(id: string): Promise<{ ok: true }> {
    const config = storageConfig();

    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select({ url: documents.url, title: documents.title })
        .from(documents)
        .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
        .limit(1);
      if (!rows[0]) throw new NotFoundException("not_found");

      await tx
        .update(documents)
        .set({ deletedAt: new Date() })
        .where(eq(documents.id, id));
      return rows[0];
    });

    if (config && !/^https?:\/\//i.test(row.url)) {
      await deleteObject(config, row.url);
    }

    await this.audit.record({
      action: "document.deleted",
      resource: "document",
      resourceId: id,
      reason: row.title,
    });

    return { ok: true };
  }
}
