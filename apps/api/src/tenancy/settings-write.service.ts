import { Injectable, NotFoundException } from "@nestjs/common";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";

import { isConfigured, serverEnv, siteConfig } from "@yonetim/config";
import type {
  IntegrationStatusResponse,
  TenantSettingsSave,
} from "@yonetim/contracts";
import { bankAccounts, messages, tenants } from "@yonetim/db";

import { AuditService, diffOf } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";

const THIRTY_DAYS_MS = 30 * 86_400_000;

/**
 * Site ayarları yazma ve entegrasyon durumu — PROJE-DURUMU §5.2/§5.5.
 *
 * İKİ AYRI SORUN, TEK SERVİS:
 *  1. Ayarlar ekranı salt-okunurdu; `settings:write` yetkisi tanımlıydı ve
 *     hiçbir uçta kullanılmıyordu.
 *  2. Entegrasyon rozetleri `siteConfig.features` içindeki **derleme zamanı**
 *     sabitlerinden geliyordu; "WhatsApp: aktif" rozeti site hakkında hiçbir
 *     şey söylemiyor, ürün hakkında konuşuyordu.
 */
@Injectable()
export class SettingsWriteService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async save(dto: TenantSettingsSave): Promise<{ id: string }> {
    const tenantId = this.db.ctx().tenantId;

    const id = await this.db.tx(async (tx) => {
      const [before] = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!before) throw new NotFoundException("not_found");
      if (dto.defaultBankAccountId) {
        const [account] = await tx
          .select({ id: bankAccounts.id })
          .from(bankAccounts)
          .where(and(eq(bankAccounts.id, dto.defaultBankAccountId), isNull(bankAccounts.deletedAt)))
          .limit(1);
        if (!account) throw new NotFoundException("not_found:bank_account");
      }

      /*
       * `settings` JSONB **birleştiriliyor**, ezilmiyor.
       *
       * Sözlükte bu formun bilmediği anahtarlar da var (`branding`,
       * `landingHeroImageUrl`, `defaultDuesFormula`…). Nesneyi baştan yazmak,
       * formun görmediği her ayarı sessizce silmek olurdu — ve kayıp ancak
       * ilgili ekran açıldığında fark edilirdi.
       */
      const previous = (before.settings ?? {}) as Record<string, unknown>;
      const nextSettings: Record<string, unknown> = {
        ...previous,
        duesDueDayOfMonth: dto.duesDueDayOfMonth,
        lateFeeEnabled: dto.lateFeeEnabled,
        lateFeeMonthlyPct: dto.lateFeeMonthlyPct ?? null,
        kvkkContactEmail: dto.kvkkContactEmail ?? null,
        whatsappOptInRequired: dto.whatsappOptInRequired,
        /*
         * `feePaidBy` bilerek yazılmıyor: komisyonu kimin karşılayacağı artık
         * bir seçenek değil (aidat siteye net geçer, komisyon sakinden ek
         * alınır). Eski kayıtlardaki alan `previous` üzerinden korunmuyor
         * çünkü `payment` nesnesi bütün olarak yazılıyor — okuyan taraf
         * (`readPaymentSettings`) alanı zaten görmezden geliyor.
         */
        payment: { onlineEnabled: dto.onlinePaymentEnabled },
        collection: {
          method: dto.defaultPaymentMethod,
          bankAccountId: dto.defaultBankAccountId ?? null,
        },
        invoiceInfo: {
          title: dto.invoiceTitle ?? null,
          taxNumber: dto.invoiceTaxNumber ?? null,
          taxOffice: dto.invoiceTaxOffice ?? null,
          address: dto.invoiceAddress ?? null,
        },
      };

      const columns = {
        name: dto.name,
        city: dto.city ?? null,
        district: dto.district ?? null,
        neighborhood: dto.neighborhood ?? null,
        addressLine: dto.addressLine ?? null,
        postalCode: dto.postalCode ?? null,
      };

      await tx
        .update(tenants)
        .set({ ...columns, settings: nextSettings, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId));

      return { id: before.id, diff: diffOf(before as unknown as Record<string, unknown>, columns) };
    });

    await this.audit.record({
      action: "settings_updated",
      resource: "tenant",
      resourceId: id.id,
      diff: id.diff,
    });
    return { id: id.id };
  }

  /**
   * Entegrasyonların **gerçek** durumu.
   *
   * Her satır üç şeyi ayırıyor: kimlik bilgisi var mı, nereden geliyor
   * (site ayarı / platform ortamı), ve son ölçülen sonuç. Tek bir
   * "aktif/pasif" rozeti bu üçünü birleştirdiği için hiçbirini
   * söyleyemiyordu.
   */
  async integrations(): Promise<IntegrationStatusResponse> {
    const tenantId = this.db.ctx().tenantId;
    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    const { settings, byChannel, bankAccountCount } = await this.db.tx(
      async (tx) => {
        const [tenant] = await tx
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);

        /*
         * Kanal başına son 30 günün giden mesaj sayısı ve son gönderim
         * zamanı. Tek sorguda gruplanıyor: yedi entegrasyon için yedi sorgu
         * açmak, ayarlar ekranını açan herkese yedi gidiş-dönüş demekti.
         */
        const grouped = await tx
          .select({
            channel: messages.channel,
            sent: count(),
            lastAt: sql<Date | null>`max(${messages.createdAt})`,
          })
          .from(messages)
          .where(
            and(
              eq(messages.direction, "out"),
              gte(messages.createdAt, since),
            ),
          )
          .groupBy(messages.channel);

        const [accounts] = await tx
          .select({ value: count() })
          .from(bankAccounts)
          .where(
            and(eq(bankAccounts.isActive, true), isNull(bankAccounts.deletedAt)),
          );

        return {
          settings: (tenant?.settings ?? {}) as Record<string, unknown>,
          byChannel: new Map(
            grouped.map((g) => [g.channel, g] as const),
          ),
          bankAccountCount: accounts?.value ?? 0,
        };
      },
    );

    /*
     * Kimlik bilgileri `packages/config/serverEnv` üzerinden okunuyor,
     * `apps/api`'nin kendi env şeması üzerinden değil: o şema yalnız API'nin
     * **çalışması için zorunlu** değişkenleri doğruluyor ve entegrasyon
     * anahtarları isteğe bağlı. İkisini karıştırmak, eksik bir SMS
     * anahtarının API'yi hiç açılmaz hale getirmesi demekti.
     */
    const whatsappEnv = serverEnv.whatsapp();
    const smsConfigured =
      isConfigured(serverEnv.netgsm()) || isConfigured(serverEnv.iletimerkezi());
    const emailConfigured = Boolean(serverEnv.resend().apiKey);
    const paymentConfigured = isConfigured(serverEnv.iyzico());

    const tenantWhatsapp = settings.whatsapp as
      | { phoneNumberId?: string }
      | undefined;

    /*
     * WHATSAPP KARMA MODEL (2026-07-29 kararı, PROJE-DURUMU §5.5):
     * site kendi WABA'sını bağladıysa `tenant`, bağlamadıysa platformun
     * numarası. Fark yöneticiye görünmeli — "bizim numaramızdan gidiyor"
     * ile "sizin numaranızdan gidiyor" farklı sonuçlar doğuruyor.
     */
    const whatsappScope = tenantWhatsapp?.phoneNumberId
      ? "tenant"
      : whatsappEnv.phoneNumberId
        ? "platform"
        : "none";

    // Kanal adı enum; `byChannel` anahtarları da o enum'dan geliyor.
    const stat = (channel: (typeof messages.channel)["_"]["data"]) => {
      const row = byChannel.get(channel);
      return {
        sent: row?.sent ?? 0,
        lastAt: (row?.lastAt as Date | null) ?? null,
      };
    };

    const waStat = stat("whatsapp");
    const smsStat = stat("sms");
    const emailStat = stat("email");

    return {
      rows: [
        {
          key: "whatsapp",
          configured: whatsappScope !== "none",
          scope: whatsappScope,
          state: !siteConfig.features.whatsappBot
            ? "disabled"
            : whatsappScope === "none"
              ? "not_configured"
              : "connected",
          lastSuccessAt: waStat.lastAt,
          lastError: null,
          sentLast30Days: waStat.sent,
        },
        {
          key: "sms",
          configured: smsConfigured,
          scope: smsConfigured ? "platform" : "none",
          state: !siteConfig.features.smsNotify
            ? "disabled"
            : smsConfigured
              ? "connected"
              : "not_configured",
          lastSuccessAt: smsStat.lastAt,
          lastError: null,
          sentLast30Days: smsStat.sent,
        },
        {
          key: "email",
          configured: emailConfigured,
          scope: emailConfigured ? "platform" : "none",
          state: emailConfigured ? "connected" : "not_configured",
          lastSuccessAt: emailStat.lastAt,
          lastError: null,
          sentLast30Days: emailStat.sent,
        },
        {
          key: "payment",
          configured: paymentConfigured,
          scope: paymentConfigured ? "platform" : "none",
          // Sağlayıcı yapılandırılmadıysa portal ödeme akışı banka havalesi
          // talimatına düşüyor; "kapalı" değil "kurulmamış" doğru sözcük.
          state: paymentConfigured ? "connected" : "not_configured",
          lastSuccessAt: null,
          lastError: null,
          sentLast30Days: 0,
        },
        {
          key: "bank",
          /*
           * Banka için ölçüt kimlik bilgisi değil **tanımlı hesap**: mutabakat
           * bir hesap olmadan çalışamıyor ve bugüne kadarki asıl tıkanma
           * noktası buydu (§5.2).
           */
          configured: bankAccountCount > 0,
          scope: bankAccountCount > 0 ? "tenant" : "none",
          state: !siteConfig.features.bankIntegration
            ? "disabled"
            : bankAccountCount > 0
              ? "connected"
              : "not_configured",
          lastSuccessAt: null,
          lastError: null,
          sentLast30Days: 0,
        },
        {
          // e-Fatura ve KEP henüz hiç yazılmadı; "kapalı" demek onları
          // açılabilir sanmaya yol açardı. Durum açıkça "kurulmamış".
          key: "einvoice",
          configured: false,
          scope: "none",
          state: "not_configured",
          lastSuccessAt: null,
          lastError: null,
          sentLast30Days: 0,
        },
        {
          key: "kep",
          configured: false,
          scope: "none",
          state: "not_configured",
          lastSuccessAt: null,
          lastError: null,
          sentLast30Days: 0,
        },
      ],
    };
  }
}
