import { randomUUID } from "node:crypto";

import {
  Controller,
  ForbiddenException,
  Get,
  Ip,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { and, desc, eq, isNull } from "drizzle-orm";

import { RATE_LIMITS, rateLimit } from "@yonetim/auth/rate-limit";
import { siteConfig } from "@yonetim/config";
import type {
  PortalCheckoutResult,
  PortalPaymentSummary,
} from "@yonetim/contracts";
import { errors, formatKurus } from "@yonetim/core";
import {
  debts,
  payments,
  tenants,
  unitOccupancies,
  units,
  users,
} from "@yonetim/db";
import {
  calculateFees,
  createCheckout,
  isIyzicoConfigured,
} from "@yonetim/payment";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";

/**
 * Sakin ödemesi — `/v1/panel/portal/payment` (SPEC Bölüm 1.2 / 7.1).
 *
 * TUTAR İSTEMCİDEN GELMİYOR. Eski ekran ödenecek tutarı gizli bir form alanında
 * taşıyordu; o alan değiştirilebilirdi. Burada tutar her iki uçta da açık
 * borçlardan **yeniden** hesaplanıyor, dolayısıyla ekranda gösterilen ile
 * tahsil edilen aynı kural üzerinden çıkıyor.
 *
 * Hosted checkout: kart verisi hiçbir zaman sunucumuza gelmiyor (PCI-DSS).
 */
@ApiTags("panel/portal")
@Controller("v1/panel/portal/payment")
export class PortalPaymentController {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Ödeme özeti — komisyon kırılımıyla" })
  async summary(): Promise<PortalPaymentSummary> {
    const scope = await this.resolveScope();

    if (!scope) {
      return {
        unit: null,
        tenantName: "",
        items: [],
        fees: {
          amountMinor: 0,
          platformFeeMinor: 0,
          processorFeeMinor: 0,
          totalMinor: 0,
          paidBy: "management",
        },
      };
    }

    const fees = calculateFees({
      amountKurus: scope.total,
      paidBy: "management",
    });

    return {
      unit: { id: scope.unitId, number: scope.unitNumber },
      tenantName: scope.tenantName,
      items: scope.items,
      fees: {
        amountMinor: fees.amountKurus,
        platformFeeMinor: fees.platformFeeKurus,
        processorFeeMinor: fees.processorFeeKurus,
        totalMinor: fees.totalKurus,
        paidBy: fees.paidBy,
      },
    };
  }

  @Post()
  @ApiOperation({
    summary: "Ödeme başlat",
    description:
      "Gövde boş: tutar ve daire sunucuda açık borçlardan türetilir. " +
      "İstemciden tutar almak, ödenecek miktarı istemciye belirletmek olurdu.",
  })
  async start(@Ip() ip: string): Promise<PortalCheckoutResult> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new ForbiddenException("user_context_required");
    const userId = ctx.userId;

    const scope = await this.resolveScope();
    if (!scope || scope.total <= 0) {
      throw errors.validation("no_open_debt");
    }

    const limit = await rateLimit(RATE_LIMITS.payment, userId);
    if (!limit.allowed) throw errors.rateLimited();

    const fees = calculateFees({
      amountKurus: scope.total,
      paidBy: "management",
    });
    // `conversationId` hem sağlayıcı referansı hem idempotency anahtarı:
    // aynı kimlikle ikinci bir kayıt açılamıyor.
    const conversationId = randomUUID();

    await this.db.tx(async (tx) => {
      await tx.insert(payments).values({
        tenantId: ctx.tenantId,
        unitId: scope.unitId,
        payerUserId: userId,
        amountKurus: scope.total,
        platformFeeKurus: fees.platformFeeKurus,
        method: "card",
        processor: "iyzico",
        conversationId,
        status: "initiated",
        idempotencyKey: conversationId,
      });
    });

    await this.audit.record({
      action: "payment_initiated",
      resource: "payment",
      resourceId: conversationId,
      reason: `Tutar: ${formatKurus(scope.total)}`,
    });

    if (!isIyzicoConfigured()) {
      // Sağlayıcı yapılandırılmadıysa banka havalesi talimatı gösterilir;
      // kayıt yine açıldı, çünkü havaleyi de o referansla eşleştireceğiz.
      return { paymentPageUrl: null, fallback: "bank_transfer", conversationId };
    }

    const person = await this.db.bypass("payment:buyer", async (tx) => {
      const rows = await tx
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return rows[0] ?? null;
    });

    const checkout = await createCheckout({
      conversationId,
      amountKurus: scope.total,
      platformFeeKurus: fees.platformFeeKurus,
      buyer: {
        id: userId,
        name: person?.firstName ?? "-",
        surname: person?.lastName ?? "-",
        email: person?.email ?? `${userId}@ornek.invalid`,
        phone: person?.phone ?? siteConfig.legal.phoneCountryCode,
        address: scope.tenantName,
        city: "Istanbul",
        ip: ctx.ip ?? ip ?? "127.0.0.1",
      },
      basketItems: [
        {
          id: scope.unitId,
          // Sepet adı sağlayıcının kaydına gider; teknik/dil bağımsız tutulur.
          name: "common-expense-dues",
          category: "dues",
          priceKurus: scope.total,
        },
      ],
      callbackUrl: `${siteConfig.env.appUrl}/api/webhooks/iyzico`,
    });

    if (!checkout.ok) {
      await this.db.tx(async (tx) => {
        await tx
          .update(payments)
          .set({ status: "failed", failureReason: checkout.error.message })
          .where(eq(payments.conversationId, conversationId));
      });
      throw checkout.error;
    }

    return {
      paymentPageUrl: checkout.value.paymentPageUrl,
      fallback: null,
      conversationId,
    };
  }

  /**
   * Oturumdaki kullanıcının dairesi ve açık borçları.
   *
   * Özet ve başlatma **aynı** kaynaktan besleniyor: iki ayrı hesap, ekranda
   * gösterilen ile tahsil edilen tutarın ayrışmasının en kolay yolu olurdu.
   */
  private async resolveScope(): Promise<{
    unitId: string;
    unitNumber: string;
    tenantName: string;
    items: Array<{ id: string; description: string; outstandingMinor: number }>;
    total: number;
  } | null> {
    const ctx = this.db.ctx();
    if (!ctx.userId) throw new ForbiddenException("user_context_required");
    const userId = ctx.userId;

    return this.db.tx(async (tx) => {
      const occ = await tx
        .select({
          unitId: unitOccupancies.unitId,
          number: units.number,
        })
        .from(unitOccupancies)
        .innerJoin(units, eq(units.id, unitOccupancies.unitId))
        .where(
          and(
            eq(unitOccupancies.userId, userId),
            isNull(unitOccupancies.endDate),
          ),
        )
        .limit(1);

      const unit = occ[0];
      if (!unit) return null;

      const tenantRows = await tx
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);

      const open = await tx
        .select({
          id: debts.id,
          description: debts.description,
          amountKurus: debts.amountKurus,
          lateFeeKurus: debts.lateFeeKurus,
          paidKurus: debts.paidKurus,
        })
        .from(debts)
        .where(and(eq(debts.unitId, unit.unitId), isNull(debts.deletedAt)))
        .orderBy(desc(debts.dueDate));

      const items = open
        .map((d) => ({
          id: d.id,
          description: d.description,
          outstandingMinor: d.amountKurus + d.lateFeeKurus - d.paidKurus,
        }))
        .filter((d) => d.outstandingMinor > 0);

      return {
        unitId: unit.unitId,
        unitNumber: unit.number,
        tenantName: tenantRows[0]?.name ?? "",
        items,
        total: items.reduce((a, d) => a + d.outstandingMinor, 0),
      };
    });
  }
}
