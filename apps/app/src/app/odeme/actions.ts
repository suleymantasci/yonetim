"use server";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { RATE_LIMITS, rateLimit } from "@yonetim/auth";
import { siteConfig } from "@yonetim/config";
import { errors, formatKurus } from "@yonetim/core";
import { payments, users, withBypassRls, withTenant } from "@yonetim/db";
import { calculateFees, createCheckout, isIyzicoConfigured } from "@yonetim/payment";

import { audit } from "@/lib/audit";
import { requireContext } from "@/lib/context";

/**
 * Ödeme başlatma — SPEC Bölüm 7.1 / Faz 4.
 * Hosted checkout kullanılır: kart verisi hiçbir zaman sunucumuza gelmez (PCI-DSS).
 */
export async function startCheckout(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const t = await getTranslations("app.payment");
  const amountKurus = Number(formData.get("amountKurus"));
  const unitId = String(formData.get("unitId") ?? "");

  if (!Number.isInteger(amountKurus) || amountKurus <= 0 || !unitId) {
    throw errors.validation(t("invalidAmount"));
  }

  const limit = await rateLimit(RATE_LIMITS.payment, ctx.userId);
  if (!limit.allowed) throw errors.rateLimited();

  const fees = calculateFees({ amountKurus, paidBy: "management" });
  const conversationId = randomUUID();

  await withTenant(
    ctx.tenantId,
    async (tx) => {
      await tx.insert(payments).values({
        tenantId: ctx.tenantId,
        unitId,
        payerUserId: ctx.userId,
        amountKurus,
        platformFeeKurus: fees.platformFeeKurus,
        method: "card",
        processor: "iyzico",
        conversationId,
        status: "initiated",
        idempotencyKey: conversationId,
      });
    },
    { userId: ctx.userId },
  );

  await audit(ctx, {
    action: "payment_initiated",
    resource: "payment",
    resourceId: conversationId,
    reason: `Tutar: ${formatKurus(amountKurus)}`,
  });

  if (!isIyzicoConfigured()) {
    // Sağlayıcı yapılandırılmadıysa banka havalesi talimatına yönlendir.
    redirect(`/odeme/havale?ref=${conversationId}`);
  }

  const person = await withBypassRls("payment:buyer", async (tx) => {
    const rows = await tx.select().from(users).where(eq(users.id, ctx.userId)).limit(1);
    return rows[0] ?? null;
  });

  const h = await headers();
  const checkout = await createCheckout({
    conversationId,
    amountKurus,
    platformFeeKurus: fees.platformFeeKurus,
    buyer: {
      id: ctx.userId,
      name: person?.firstName ?? "-",
      surname: person?.lastName ?? "-",
      email: person?.email ?? `${ctx.userId}@ornek.invalid`,
      phone: person?.phone ?? siteConfig.legal.phoneCountryCode,
      address: ctx.tenantName,
      city: "Istanbul",
      ip: h.get("x-client-ip") ?? "127.0.0.1",
    },
    basketItems: [
      {
        id: unitId,
        // Sepet adı ödeme sağlayıcısının kaydına gider; teknik/dil bağımsız tutulur.
        name: "common-expense-dues",
        category: "dues",
        priceKurus: amountKurus,
      },
    ],
    callbackUrl: `${siteConfig.env.appUrl}/api/webhooks/iyzico`,
  });

  if (!checkout.ok) {
    await withTenant(ctx.tenantId, async (tx) => {
      await tx
        .update(payments)
        .set({ status: "failed", failureReason: checkout.error.message })
        .where(eq(payments.conversationId, conversationId));
    });
    throw checkout.error;
  }

  redirect(checkout.value.paymentPageUrl);
}
