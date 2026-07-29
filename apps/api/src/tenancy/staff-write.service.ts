import { Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type {
  StaffDetail,
  StaffSave,
  StaffSaveResult,
} from "@yonetim/contracts";
import { normalizePhone } from "@yonetim/core";
import { staff } from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import { PiiService } from "../property/resident/pii.service";

/**
 * Personel yazma — §5.2'deki "salt-okunur modüller" listesinin ilk maddesi.
 *
 * NEDEN `TenancyService`'İN İÇİNDE DEĞİL: o dosya okuma tarafını ve tazminat
 * hesabını taşıyor ve ikisi de **hiçbir şey yazmıyor**. Yazma yolunun ayrı
 * durması, "şifre çözme anahtarına dokunan kod" ile "dokunmayan kod"
 * arasındaki sınırı dosya düzeyinde görünür kılıyor (§9.1).
 *
 * TCKN/IBAN ŞİFRELEME `PiiService` ÜZERİNDEN: sakinlerde kullanılan aynı
 * servis. İkinci bir şifreleme yolu açmak, anahtar döndürme gününde iki ayrı
 * yerin güncellenmesini gerektirirdi.
 *
 * NOT — `staff` tablosunda TCKN/IBAN için **blind index kolonu yok**
 * (`users`'ta var). Personelde eşitlik sorgusuna ihtiyaç duyan bir akış
 * bugün yok: mutabakat sakinin IBAN'ıyla eşleşiyor, personelinkiyle değil.
 * `PiiService` index'i yine üretiyor, burada kullanılmıyor — ihtiyaç doğarsa
 * eklenecek kolon, değişecek şifreleme değil.
 */
@Injectable()
export class StaffWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly pii: PiiService,
  ) {}

  /**
   * Düzenleme formunu dolduran tek satır okuması.
   *
   * Telefon **ham** dönüyor (listede maskeli): maskeyle doldurulmuş bir form
   * kaydedildiğinde maske numaranın yerine yazılırdı. TCKN/IBAN yine
   * dönmüyor — form onları "değiştirilmediyse dokunma" olarak ele alıyor.
   */
  async detail(id: string): Promise<StaffDetail> {
    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select()
        .from(staff)
        .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!row) throw new NotFoundException("not_found");

    return {
      id: row.id,
      fullName: row.fullName,
      role: row.role,
      phone: row.phone,
      grossSalaryMinor: row.grossSalaryKurus,
      netSalaryMinor: row.netSalaryKurus,
      sgkPremiumMinor: row.sgkPremiumKurus,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      annualLeaveDays: row.annualLeaveDays,
      usedLeaveDays: row.usedLeaveDays,
      advanceBalanceMinor: row.advanceBalanceKurus,
      isActive: row.isActive,
      hasTckn: row.tcknEncrypted !== null,
      hasIban: row.ibanEncrypted !== null,
    };
  }

  /** `id` yoksa oluşturur, varsa günceller. */
  async save(dto: StaffSave, id?: string): Promise<StaffSaveResult> {
    const tenantId = this.db.ctx().tenantId;

    /*
     * Ayrılış tarihi girildiyse kayıt pasife düşer.
     *
     * Ayrı bir "aktif mi" kutucuğu koymak iki alanın çelişmesine izin verirdi
     * ("ayrıldı ama aktif") ve o çelişki aylık maliyet toplamını sessizce
     * şişirirdi — toplam yalnız aktifleri sayıyor. Tek kaynak tarih.
     */
    const isActive = !dto.endedAt;

    const base = {
      fullName: dto.fullName,
      role: dto.role,
      phone: dto.phone ? normalizePhone(dto.phone) : null,
      grossSalaryKurus: dto.grossSalaryMinor,
      netSalaryKurus: dto.netSalaryMinor,
      sgkPremiumKurus: dto.sgkPremiumMinor,
      startedAt: dto.startedAt,
      endedAt: dto.endedAt ?? null,
      annualLeaveDays: dto.annualLeaveDays,
      usedLeaveDays: dto.usedLeaveDays,
      advanceBalanceKurus: dto.advanceBalanceMinor,
      isActive,
    };

    /*
     * Şifreli alanların üç durumu var ve üçü de farklı:
     *  - yeni değer geldi        → şifrele, yaz
     *  - "sil" işaretlendi       → NULL'la
     *  - ikisi de yok            → **dokunma** (mevcut kayıt korunur)
     *
     * Üçüncüsü olmadan, formu her açıp kaydeden kişi TCKN'i silerdi: alan
     * ekrana hiç gelmediği için boş görünüyor.
     */
    const tcknValue = dto.clearTckn
      ? { tcknEncrypted: null }
      : dto.tckn
        ? { tcknEncrypted: this.pii.sealTckn(dto.tckn, tenantId)?.encrypted ?? null }
        : {};
    const ibanValue = dto.clearIban
      ? { ibanEncrypted: null }
      : dto.iban
        ? { ibanEncrypted: this.pii.sealIban(dto.iban, tenantId)?.encrypted ?? null }
        : {};

    const values = { ...base, ...tcknValue, ...ibanValue };

    const result = await this.db.tx(async (tx) => {
      if (!id) {
        const [created] = await tx
          .insert(staff)
          .values({ ...values, tenantId })
          .returning({ id: staff.id, fullName: staff.fullName });
        if (!created) throw new NotFoundException("internal");
        return { ...created, diff: undefined };
      }

      const [before] = await tx
        .select()
        .from(staff)
        .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      await tx
        .update(staff)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(staff.id, id));

      /*
       * Denetim farkından şifreli alanlar **çıkarılıyor**: kütük sakine ve
       * denetçiye gösterilebilen bir kayıt ve şifreli metnin oraya düşmesi
       * hem anlamsız hem de sızıntı yüzeyi. "Değişti mi" bilgisi ayrı bir
       * bayrakla taşınıyor.
       */
      const diff = diffOf(
        before as unknown as Record<string, unknown>,
        base as unknown as Record<string, unknown>,
      );
      if (dto.tckn || dto.clearTckn) {
        diff.tcknEncrypted = { from: "***", to: dto.clearTckn ? null : "***" };
      }
      if (dto.iban || dto.clearIban) {
        diff.ibanEncrypted = { from: "***", to: dto.clearIban ? null : "***" };
      }

      return { id, fullName: dto.fullName, diff };
    });

    await this.audit.record({
      action: id ? "staff_updated" : "staff_created",
      resource: "staff",
      resourceId: result.id,
      diff: result.diff,
    });

    return { id: result.id, fullName: result.fullName };
  }

  /**
   * Kayıt silme — **soft delete**.
   *
   * Sert silme yapılmıyor: personelin puantajı (`staff_attendance`), izni
   * (`staff_leaves`) ve zimmetli demirbaşı (`inventory_items`) satıra bağlı.
   * Ayrıca "kim ne zaman çalıştı" sorusu iş hukuku uyuşmazlığında yıllar
   * sonra sorulabiliyor. Ayrılan personel için doğru işlem silme değil,
   * **ayrılış tarihi girmek** — bu uç yalnız yanlış açılmış kayıt içindir.
   */
  async remove(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
        .limit(1);
      if (!row) throw new NotFoundException("not_found");

      await tx
        .update(staff)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(eq(staff.id, id));
    });

    await this.audit.record({
      action: "staff_deleted",
      resource: "staff",
      resourceId: id,
    });
    return { id };
  }
}
