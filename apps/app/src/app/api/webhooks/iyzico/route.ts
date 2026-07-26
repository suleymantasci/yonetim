import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { formatKurus } from "@yonetim/core";
import { debts, payments, paymentAllocations, withBypassRls } from "@yonetim/db";
import { allocatePayment } from "@yonetim/dues";
import { retrievePayment } from "@yonetim/payment";

/**
 * iyzico ödeme dönüşü — SPEC Bölüm 7.1 / Faz 4.
 * Webhook-first mimari: ödeme tamamlandığında borç eşleştirmesi anında yapılır
 * (Bölüm 1.2 "borç bilgisi 3+ gün gecikmesi" şikâyetinin çözümü).
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  if (!token) return NextResponse.json({ error: "token yok" }, { status: 400 });

  const detail = await retrievePayment(token);
  if (!detail.ok) {
    return NextResponse.json({ error: detail.error.message }, { status: 502 });
  }

  const payment = detail.value;

  const existing = await withBypassRls("iyzico:idempotency", async (tx) => {
    const rows = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.processorRef, payment.paymentId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  const record = await withBypassRls("iyzico:record", async (tx) => {
    const rows = await tx
      .select()
      .from(payments)
      .where(eq(payments.conversationId, payment.conversationId))
      .limit(1);
    return rows[0] ?? null;
  });

  if (!record) return NextResponse.json({ error: "payment_not_found" }, { status: 404 });

  if (payment.status !== "success") {
    await withBypassRls("iyzico:fail", async (tx) => {
      await tx
        .update(payments)
        .set({ status: "failed", failureReason: payment.errorMessage, processorRef: payment.paymentId })
        .where(eq(payments.id, record.id));
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  await withBypassRls("iyzico:settle", async (tx) => {
    await tx
      .update(payments)
      .set({
        status: "completed",
        processorRef: payment.paymentId,
        paidAt: new Date(),
        installment: payment.installment,
        cardLast4: payment.cardLast4,
        cardBrand: payment.cardBrand,
        processorFeeKurus: payment.merchantCommissionKurus,
      })
      .where(eq(payments.id, record.id));

    const open = record.unitId
      ? await tx.select().from(debts).where(eq(debts.unitId, record.unitId))
      : [];

    const allocation = allocatePayment(
      payment.paidPriceKurus,
      open
        .filter((d) => d.amountKurus + d.lateFeeKurus - d.paidKurus > 0)
        .map((d) => ({
          id: d.id,
          dueDate: d.dueDate,
          amountKurus: d.amountKurus,
          paidKurus: d.paidKurus,
          lateFeeKurus: d.lateFeeKurus,
        })),
    );

    for (const a of allocation.allocations) {
      await tx.insert(paymentAllocations).values({
        tenantId: record.tenantId,
        paymentId: record.id,
        debtId: a.debtId,
        amountKurus: a.amountKurus,
      });
      const debt = open.find((d) => d.id === a.debtId);
      if (!debt) continue;
      await tx
        .update(debts)
        .set({
          paidKurus: debt.paidKurus + a.amountKurus,
          status: a.fullyPaid ? "paid" : "partial",
        })
        .where(eq(debts.id, a.debtId));
    }
  });

  return NextResponse.json({ ok: true, amount: formatKurus(payment.paidPriceKurus) });
}
