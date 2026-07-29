import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";

import type {
  BankAccountDetail,
  BankAccountSave,
  BankAccountSaveResult,
} from "@yonetim/contracts";
import { isValidIban } from "@yonetim/core";
import { bankAccounts, payments } from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import { PiiService } from "../property/resident/pii.service";

/**
 * Banka hesabı tanımı — PROJE-DURUMU §5.2, sıra 6.
 *
 * MODÜLÜN GİRİŞİYDİ VE KAPALIYDI: `bank_accounts` tablosu, mutabakat
 * ekranı ve hareket listesi vardı ama hesap tanımlamanın yolu yoktu. Hesap
 * olmadan hareket de mutabakat da boş kalıyordu — ekran çalışıyor gibi
 * görünüp hiçbir şey yapamıyordu.
 *
 * IBAN ŞİFRELEME sakinlerdeki **aynı** `PiiService` üzerinden: maskeli kopya
 * ve blind index birlikte üretiliyor. Eşleştirme index'le yapıldığı için
 * panelin tam IBAN'a hiçbir zaman ihtiyacı olmuyor (§9.1).
 */
@Injectable()
export class BankAccountWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly pii: PiiService,
  ) {}

  async detail(id: string): Promise<BankAccountDetail> {
    const row = await this.db.tx(async (tx) => {
      const [account] = await tx
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, id), isNull(bankAccounts.deletedAt)))
        .limit(1);
      if (!account) return null;

      const [payment] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.bankAccountId, id))
        .limit(1);

      return { account, hasPayments: Boolean(payment) };
    });
    if (!row) throw new NotFoundException("not_found");

    return {
      id: row.account.id,
      bankName: row.account.bankName,
      ibanMasked: row.account.ibanMasked,
      accountName: row.account.accountName,
      purpose: row.account.purpose as BankAccountDetail["purpose"],
      isActive: row.account.isActive,
      hasPayments: row.hasPayments,
    };
  }

  async save(
    dto: BankAccountSave,
    id?: string,
  ): Promise<BankAccountSaveResult> {
    const tenantId = this.db.ctx().tenantId;
    const normalized = dto.iban.replace(/\s+/g, "").toUpperCase();

    /*
     * IBAN **kontrol basamağıyla** doğrulanıyor (mod-97), yalnız uzunlukla
     * değil. Yanlış yazılmış bir IBAN'ı kabul etmek, o hesaba yapılan
     * havalelerin hiçbir zaman eşleşmemesi demek — ve sorun aylar sonra
     * "para geldi ama sistemde görünmüyor" olarak ortaya çıkardı.
     */
    if (!isValidIban(normalized)) {
      throw new BadRequestException("invalid:iban");
    }

    const sealed = this.pii.sealIban(normalized, tenantId);
    if (!sealed) throw new BadRequestException("invalid:iban");

    const result = await this.db.tx(async (tx) => {
      /*
       * AYNI IBAN İKİ KEZ TANIMLANAMAZ.
       *
       * Karşılaştırma blind index üzerinden — açık IBAN hiçbir yerde
       * karşılaştırılabilir metin olarak durmuyor. İki kayıt olsaydı gelen
       * havale ikisiyle de eşleşir ve mutabakat hangisine yazacağını
       * bilemezdi.
       */
      const existing = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.ibanIndex, sealed.index),
            isNull(bankAccounts.deletedAt),
          ),
        )
        .limit(1);
      if (existing[0] && existing[0].id !== id) {
        throw new ConflictException("conflict:iban_taken");
      }

      const values = {
        bankName: dto.bankName,
        ibanEncrypted: sealed.encrypted,
        ibanMasked: sealed.masked,
        ibanIndex: sealed.index,
        accountName: dto.accountName ?? null,
        purpose: dto.purpose,
        isActive: dto.isActive,
      };

      if (!id) {
        const [created] = await tx
          .insert(bankAccounts)
          .values({ ...values, tenantId })
          .returning({
            id: bankAccounts.id,
            ibanMasked: bankAccounts.ibanMasked,
          });
        if (!created) throw new NotFoundException("internal");
        return { ...created, diff: undefined };
      }

      const [before] = await tx
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, id), isNull(bankAccounts.deletedAt)))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");

      await tx
        .update(bankAccounts)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(bankAccounts.id, id));

      /*
       * Denetim farkından şifreli IBAN çıkarılıyor; maskeli kopya kalıyor.
       * Kütük denetçiye gösterilebilen bir kayıt ve şifreli metin orada hem
       * anlamsız hem sızıntı yüzeyi.
       */
      return {
        id,
        ibanMasked: sealed.masked,
        diff: diffOf(before as unknown as Record<string, unknown>, {
          bankName: values.bankName,
          ibanMasked: values.ibanMasked,
          accountName: values.accountName,
          purpose: values.purpose,
          isActive: values.isActive,
        }),
      };
    });

    await this.audit.record({
      action: id ? "bank_account_updated" : "bank_account_created",
      resource: "bank_account",
      resourceId: result.id,
      diff: result.diff,
    });
    return { id: result.id, ibanMasked: result.ibanMasked };
  }

  /**
   * Hesabı kaldır — **soft delete**.
   *
   * Bu hesaba bağlı ödeme varsa yine soft delete yapılıyor ve ödemenin
   * `bank_account_id`'si `ON DELETE SET NULL` sayesinde değil, satır durduğu
   * için **korunuyor**: geçmiş ödemenin hangi hesaba yattığı bilgisi
   * kaybolmamalı. Kapanan hesap için doğru işlem zaten `isActive: false`.
   */
  async remove(id: string): Promise<{ id: string }> {
    await this.db.tx(async (tx) => {
      const [row] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, id), isNull(bankAccounts.deletedAt)))
        .limit(1);
      if (!row) throw new NotFoundException("not_found");

      await tx
        .update(bankAccounts)
        .set({ deletedAt: new Date(), isActive: false, updatedAt: new Date() })
        .where(eq(bankAccounts.id, id));
    });

    await this.audit.record({
      action: "bank_account_deleted",
      resource: "bank_account",
      resourceId: id,
    });
    return { id };
  }
}
