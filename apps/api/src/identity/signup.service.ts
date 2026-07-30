import { Injectable, Logger } from "@nestjs/common";
import { and, count, eq, isNull, sql } from "drizzle-orm";

import { checkPasswordPolicy, hashPassword } from "@yonetim/auth";
import { siteConfig } from "@yonetim/config";
import type {
  AccessRequestCreate,
  SetupTenant,
  SetupTenantResult,
  SignupStart,
  SignupStartResult,
} from "@yonetim/contracts";
import { errors, normalizePhone, slugify } from "@yonetim/core";
import type { Database } from "@yonetim/db";
import {
  accessRequests,
  companies,
  memberships,
  plans,
  subscriptions,
  tenants,
  units,
  users,
} from "@yonetim/db";
import { planForUnitCount, planYearlyKurus } from "@yonetim/pricing";

import { DbService } from "../infra/db/db.service";
import { WebAuthService } from "./web-auth.service";

/**
 * Kayıt ve kurulum akışları — `/kayit`, `/kayit-talebi`, `/kurulum`.
 *
 * NEDEN BUGÜNE KADAR YOKTU: `apps/web`'in bütün CTA'ları `/kayit`'e,
 * site landing sayfaları `/kayit-talebi`'ne bakıyordu; ikisi de 404
 * veriyordu. Yani pazarlama sitesinin tamamı ölü bir düğmeye çıkıyordu.
 *
 * KAYIT OTURUM AÇMAZ. Site ve üyelik oluşuyor ama kullanıcı ancak
 * e-posta/telefonunu doğrulayınca giriyor — doğrulama giriş akışının aynı
 * ucundan (`POST /v1/auth/web/verify`) geçiyor, ikinci bir doğrulama yolu
 * açılmıyor. Doğrulamasız site açılabilseydi başkasının adresiyle site açıp
 * o kişiyi kilitlemek mümkün olurdu.
 */
@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly db: DbService,
    private readonly web: WebAuthService,
  ) {}

  /* ------------------------------------------------------------ /kayit */

  async start(dto: SignupStart, locale?: string): Promise<SignupStartResult> {
    const isEmail = dto.identifier.includes("@");
    const identifier = isEmail
      ? dto.identifier.trim().toLowerCase()
      : normalizePhone(dto.identifier);
    if (!identifier) throw errors.validation("invalid_identifier");

    // Güç kuralı sözleşmede değil burada: "büyük harf içermeli" gibi kurallar
    // şemaya yazılsaydı, parola değiştirme ucunda ikinci kez yazılmaları
    // gerekirdi — iki kopyanın biri er ya da geç geride kalırdı.
    const policy = checkPasswordPolicy(dto.password);
    if (!policy.ok) {
      throw errors.validation("weak_password", { problems: policy.problems });
    }
    const passwordHash = await hashPassword(dto.password);

    const result = await this.db.bypass("signup:create-tenant", async (tx) => {
      // Var olan kullanıcıyı yeniden yaratmıyoruz: bir yönetici ikinci sitesini
      // açıyor olabilir ve "tek cari" modelinde kişi platformda tekildir.
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(isEmail ? eq(users.email, identifier) : eq(users.phone, identifier))
        .limit(1);

      const [firstName, ...rest] = dto.fullName.trim().split(/\s+/);
      const userId =
        existing[0]?.id ??
        (
          await tx
            .insert(users)
            .values({
              email: isEmail ? identifier : null,
              phone: isEmail ? null : identifier,
              firstName: firstName ?? dto.fullName,
              lastName: rest.join(" ") || null,
              locale: locale ?? "tr",
              // Parola YALNIZCA yeni kullanıcıda yazılıyor. Var olan kaydın
              // parolasını buradan ezmek, "kayıt ol" formuna başkasının
              // e-postasını yazarak o hesabı devralmak demekti — parola
              // değiştirmenin yolu oturum açmış profil ekranı ya da kurtarma
              // akışı. İkinci sitesini açan yönetici zaten mevcut parolasıyla
              // giriyor.
              passwordHash,
            })
            .returning({ id: users.id })
        )[0]!.id;

      // Yönetim firması kaydı: firma kaydı açılıyor ve site ona bağlanıyor.
      // Sonraki siteler `/kurulum`'dan aynı firmaya eklenip `/panel/portfoy`
      // ekranında tek listede görünüyor.
      const companyId = dto.companyName
        ? (
            await tx
              .insert(companies)
              .values({
                name: dto.companyName,
                slug: await this.uniqueSlug(tx, companies, dto.companyName),
              })
              .returning({ id: companies.id })
          )[0]!.id
        : null;

      const slug = await this.uniqueSlug(tx, tenants, dto.propertyName);
      const trialDays = siteConfig.billing.trial.durationDays;
      const now = new Date();

      const tenant = (
        await tx
          .insert(tenants)
          .values({
            slug,
            name: dto.propertyName,
            type: dto.propertyType,
            unitCount: dto.unitCount,
            city: dto.city ?? null,
            managerId: userId,
            companyId,
            status: "trial",
            trialStartedAt: now,
            trialEndsAt: new Date(now.getTime() + trialDays * 86_400_000),
            // Kampanya ve rakip geçişi kaydı: pazarlama tarafı hangi kanalın
            // dönüştüğünü ancak burada öğrenebiliyor.
            settings: {
              ...(dto.campaign ? { signupCampaign: dto.campaign } : {}),
              ...(dto.migrationSource ? { migrationSource: dto.migrationSource } : {}),
            },
          })
          .returning({ id: tenants.id, slug: tenants.slug })
      )[0]!;

      await tx.insert(memberships).values({
        tenantId: tenant.id,
        userId,
        // Firma kaydında bile ilk kullanıcı `company_admin` değil `manager`
        // olmuyor: `company_admin` çoklu site yetkisi ve o yetki firmanın
        // varlığına bağlı.
        role: dto.companyName ? "company_admin" : "manager",
        isPrimary: true,
      });

      await this.openTrialSubscription(tx, {
        tenantId: tenant.id,
        unitCount: dto.unitCount,
        trialEndsAt: new Date(now.getTime() + trialDays * 86_400_000),
      });

      return { tenantId: tenant.id, slug: tenant.slug, userId };
    });

    // Doğrulama kodu giriş akışının aynı ucundan gidiyor.
    await this.web.request({ identifier, locale });

    this.logger.log({
      event: "signup.started",
      tenantId: result.tenantId,
      isCompany: Boolean(dto.companyName),
      campaign: dto.campaign,
    });

    return {
      channel: isEmail ? "email" : "sms",
      identifier,
      tenantSlug: result.slug,
    };
  }

  /* ---------------------------------------------------- /kayit-talebi */

  /**
   * Sakin erişim talebi.
   *
   * Yanıt her koşulda aynı: site bulunamasa da, aynı talep zaten dursa da
   * `{ received: true }` dönüyor. Farklı yanıt vermek, ucu "bu sitede bu
   * numara kayıtlı mı" sorusunun sorulabildiği bir yüzeye çevirirdi.
   */
  async createAccessRequest(
    dto: AccessRequestCreate,
    ip?: string,
  ): Promise<{ received: true }> {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw errors.validation("invalid_phone");

    await this.db
      .bypass("public:access-request", async (tx) => {
        const tenant = await tx
          .select({ id: tenants.id })
          .from(tenants)
          .where(and(eq(tenants.slug, dto.tenantSlug), isNull(tenants.deletedAt)))
          .limit(1);
        if (!tenant[0]) return;

        const user = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.phone, phone))
          .limit(1);

        await tx
          .insert(accessRequests)
          .values({
            tenantId: tenant[0].id,
            userId: user[0]?.id ?? null,
            fullName: dto.fullName,
            phone,
            email: dto.email ?? null,
            blockLabel: dto.blockLabel ?? null,
            unitLabel: dto.unitLabel,
            claimedRelation: dto.claimedRelation,
            note: dto.note ?? null,
            ip: ip ?? null,
          })
          // Bekleyen talep varken gelen tekrar sessizce yutuluyor: kısmi
          // benzersiz index zaten engelliyor, hata döndürmek başvuranın
          // numarasının kuyrukta olduğunu doğrulamak olurdu.
          .onConflictDoNothing();
      })
      .catch((error: unknown) => {
        // Talep alınamasa bile yanıt değişmiyor; hata yalnız loga düşüyor.
        this.logger.warn({ event: "access_request.failed", error: String(error) });
      });

    return { received: true };
  }

  /* --------------------------------------------------------- /kurulum */

  /**
   * Hesabı olan ama hiç sitesi olmayan kullanıcı için site kurulumu.
   *
   * `requireContext()` bu durumu zaten `/kurulum`'a yönlendiriyordu; sayfa da
   * uç da yoktu, yani üyeliği kaldırılan kullanıcı 404 görüyordu.
   */
  async setup(
    userId: string,
    dto: SetupTenant,
    locale?: string,
  ): Promise<SetupTenantResult> {
    return this.db.bypass("signup:setup-tenant", async (tx) => {
      const slug = await this.uniqueSlug(tx, tenants, dto.propertyName);
      const now = new Date();
      const trialEndsAt = new Date(
        now.getTime() + siteConfig.billing.trial.durationDays * 86_400_000,
      );

      // Kullanıcı zaten bir firmaya bağlıysa yeni site de o firmaya bağlanıyor;
      // yoksa portföy ekranı siteleri ayrı ayrı gösterirdi.
      const existingCompany = await tx
        .select({ companyId: tenants.companyId })
        .from(tenants)
        .innerJoin(memberships, eq(memberships.tenantId, tenants.id))
        .where(and(eq(memberships.userId, userId), sql`${tenants.companyId} IS NOT NULL`))
        .limit(1);

      const tenant = (
        await tx
          .insert(tenants)
          .values({
            slug,
            name: dto.propertyName,
            type: dto.propertyType,
            unitCount: dto.unitCount,
            city: dto.city ?? null,
            managerId: userId,
            companyId: existingCompany[0]?.companyId ?? null,
            status: "trial",
            trialStartedAt: now,
            trialEndsAt,
          })
          .returning({ id: tenants.id, slug: tenants.slug })
      )[0]!;

      await tx.insert(memberships).values({
        tenantId: tenant.id,
        userId,
        role: existingCompany[0]?.companyId ? "company_admin" : "manager",
        isPrimary: true,
      });

      // Birim üretimi opsiyonel: "1"…"N" numaralandırması çoğu apartmanda
      // doğru ama sitelerde blok yapısı var. İsteyen sonra toplu ekliyor.
      if (dto.generateUnits) {
        await tx.insert(units).values(
          Array.from({ length: dto.unitCount }, (_, index) => ({
            tenantId: tenant.id,
            number: String(index + 1),
            floor: 0,
          })),
        );
      }

      await this.openTrialSubscription(tx, {
        tenantId: tenant.id,
        unitCount: dto.unitCount,
        trialEndsAt,
      });

      this.logger.log({ event: "setup.tenant_created", tenantId: tenant.id, locale });
      return { tenantId: tenant.id, slug: tenant.slug };
    });
  }

  /**
   * Deneme aboneliğini açar — site oluşturmanın ayrılmaz parçası.
   *
   * NEDEN BUGÜNE KADAR YOKTU VE NEDEN ÖNEMLİ: `subscriptions` tablosu
   * baştan beri şemada duruyordu ama **hiçbir kod ona satır yazmıyordu**.
   * Tenant'a `trial` + `trialEndsAt` yazılıyor, abonelik satırı açılmıyordu.
   * Sonucu iki yerde görünüyordu: süper-admin panelindeki MRR/ARR kartları her
   * koşulda 0 gösteriyordu (sorgu `subscriptions`'tan okuyor), ve deneme
   * süresi dolan hesabı tanıyacak kayıt yoktu — faturalama job'ları neye
   * bakacağını bilemezdi.
   *
   * Tenant'taki `trialEndsAt` ile buradaki `trialEndsAt` **bilinçli olarak
   * aynı** ve tek çağrıda birlikte yazılıyor: tenant'ın durumu erişim
   * kararlarının (panel açılır mı) kaynağı, aboneliğin durumu faturalamanın
   * kaynağı. İkisini tek tabloya sıkıştırmak, "erişimi kes ama aboneliği
   * dondur" gibi ayrı yaşayan durumları ifade edilemez hâle getirirdi.
   *
   * Plan `plans` tablosundan **koda göre** çözülüyor, kademe sırasına göre
   * değil: `planForUnitCount` daire sayısından kademeyi biliyor, veritabanı da
   * o kademenin id'sini tutuyor. Plan satırı yoksa (seed çalıştırılmamış)
   * abonelik açılamaz — bu durumda kurulumu düşürmüyoruz, uyarı loglayıp
   * geçiyoruz: site açamamak, faturalama kaydı eksik kalmasından daha kötü.
   */
  private async openTrialSubscription(
    tx: Database,
    params: { tenantId: string; unitCount: number; trialEndsAt: Date },
  ): Promise<void> {
    const definition = planForUnitCount(params.unitCount);
    const priceKurus = planYearlyKurus(definition);

    const planRow = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(eq(plans.code, definition.code))
      .limit(1);

    const planId = planRow[0]?.id;
    if (!planId) {
      this.logger.warn({
        event: "subscription.plan_missing",
        tenantId: params.tenantId,
        planCode: definition.code,
      });
      return;
    }

    await tx.insert(subscriptions).values({
      tenantId: params.tenantId,
      planId,
      status: "trialing",
      billingPeriod: siteConfig.billing.defaultPeriod,
      unitCountSnapshot: params.unitCount,
      // Denemede tahsilat yok ama fiyat **biliniyor**: deneme bitiminde
      // yöneticiye gösterilecek tutar bu satırdan okunuyor, o an yeniden
      // hesaplanmıyor. Aksi hâlde araya fiyat artışı girerse kullanıcıya
      // kayıt anında gösterilenden farklı bir tutar çıkardı.
      priceKurus,
      listPriceKurus: priceKurus,
      trialEndsAt: params.trialEndsAt,
    });
  }

  /**
   * Ad → benzersiz slug.
   *
   * Slug istemciden alınmıyor: kullanıcıya "bu adres dolu, başka dene" turu
   * attırmak kaydın en kırılgan adımında gereksiz bir engel. Çakışmada sonuna
   * sayı ekleniyor.
   */
  private async uniqueSlug(
    tx: Database,
    table: typeof tenants | typeof companies,
    name: string,
  ): Promise<string> {
    const base = slugify(name).slice(0, 40) || "site";
    for (let suffix = 0; suffix < 50; suffix++) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const taken = await tx
        .select({ n: count() })
        .from(table)
        .where(eq(table.slug, candidate));
      if (Number(taken[0]?.n ?? 0) === 0) return candidate;
    }
    // 50 denemede yer bulunamıyorsa ad zaten anlamsız derecede yaygın demektir.
    return `${base}-${Date.now().toString(36)}`;
  }
}
