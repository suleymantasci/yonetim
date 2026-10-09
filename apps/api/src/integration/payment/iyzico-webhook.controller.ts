import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { errors, formatKurus } from "@yonetim/core";
import { debts, paymentAllocations, payments, units } from "@yonetim/db";
import { allocatePayment } from "@yonetim/dues";
import { retrievePayment } from "@yonetim/payment";

import { Public } from "../../identity/decorators";
import { DbService } from "../../infra/db/db.service";

/**
 * iyzico ödeme dönüşü — SPEC Bölüm 7.1 / Faz 4.
 *
 * Webhook-first: ödeme tamamlandığı **anda** borç eşleştirmesi yapılır
 * (Bölüm 1.2'deki "borç bilgisi 3+ gün gecikiyor" şikâyetinin çözümü).
 *
 * GÜVEN MODELİ: gövdedeki `token` dışında hiçbir şeye güvenilmiyor. Tutar,
 * durum ve kart bilgisi iyzico'dan **yeniden** sorgulanıyor (`retrievePayment`);
 * webhook gövdesine güvenmek, "ödendi" diyen sahte bir POST'un borcu
 * kapatmasına izin vermek olurdu.
 *
 * TEKRAR KORUMASI: aynı `processorRef` ikinci kez işlenmiyor. Sağlayıcılar
 * webhook'u yeniden gönderir; korumasız bir uçta bu, aynı ödemeyi iki kez
 * mahsup etmek demektir.
 *
 * H-12: İki eşzamanlı webhook aynı `conversationId` ile gelirse tek
 * transaction içinde `SELECT … FOR UPDATE` ile payment satırını
 * kilitliyoruz; `payment_allocations(payment_id, debt_id)` unique
 * constraint mahsupun iki kez yazılmasını DB seviyesinde engelliyor.
 */
@ApiExcludeController()
@Controller("v1/webhooks/iyzico")
export class IyzicoWebhookController {
  constructor(private readonly db: DbService) {}

  @Post()
  @Public()
  @HttpCode(200)
  async receive(@Body() body: unknown) {
    const { token } = callbackSchema.parse(body ?? {});

    const detail = await retrievePayment(token);
    if (!detail.ok) {
      throw errors.internal(detail.error.message);
    }
    const payment = detail.value;

    const existing = await this.db.bypass("iyzico:idempotency", async (tx) => {
      const rows = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.processorRef, payment.paymentId))
        .limit(1);
      return rows[0] ?? null;
    });
    if (existing) return { ok: true, duplicate: true };

    // Kaydı `conversationId` ile buluyoruz: ödeme başlatılırken bu kimlik
    // bizim tarafımızda üretildi, dolayısıyla tenant'ı da o belirliyor.
    // `FOR UPDATE` aynı anda iki webhook gelirse diğerinin beklemesini sağlar.
    const record = await this.db.bypass("iyzico:record", async (tx) => {
      const rows = await tx
        .select()
        .from(payments)
        .where(eq(payments.conversationId, payment.conversationId))
        .for("update")
        .limit(1);
      return rows[0] ?? null;
    });
    if (!record) throw errors.notFound("payment_not_found");

    if (payment.status !== "success") {
      await this.db.tenantScoped(record.tenantId, undefined, async (tx) => {
        await tx
          .update(payments)
          .set({
            status: "failed",
            failureReason: payment.errorMessage,
            processorRef: payment.paymentId,
          })
          .where(eq(payments.id, record.id));
      });
      return { ok: true, status: "failed" };
    }

    // M-30: paidPriceKurus ile record.amountKurus eşit değilse amount drift
    // var demektir. Status "partial" işaretlenir, fark failure_reason'a yazılır
    // (KVKK kapsamında reconciliation gerekir; otomatik allocation yapılmaz).
    const settledAmountKurus = payment.paidPriceKurus;
    const isFullAmount = settledAmountKurus === record.amountKurus;
    if (!isFullAmount) {
      // eslint-disable-next-line no-console
      console.warn(
        `[iyzico] amount drift: payment_id=${record.id} record=${record.amountKurus} paid=${settledAmountKurus}`,
      );
    }

    // Tahsilat ve mahsup **tek transaction**: ödeme "tamamlandı" görünüp
    // borçlar kapanmadan kalırsa sakin ödediği borcu ekranda görmeye devam
    // eder.
    await this.db.tenantScoped(record.tenantId, undefined, async (tx) => {
      if (record.unitId)
        await tx
          .select({ id: units.id })
          .from(units)
          .where(eq(units.id, record.unitId))
          .for("update");
      const [latest] = await tx
        .select({ processorRef: payments.processorRef })
        .from(payments)
        .where(eq(payments.id, record.id))
        .for("update");
      if (latest?.processorRef === payment.paymentId) return;
      await tx
        .update(payments)
        .set({
          status: isFullAmount ? "completed" : "partial",
          failureReason: isFullAmount
            ? null
            : `amount_drift:record=${record.amountKurus}:paid=${settledAmountKurus}`,
          processorRef: payment.paymentId,
          paidAt: new Date(),
          installment: payment.installment,
          cardLast4: payment.cardLast4,
          cardBrand: payment.cardBrand,
          processorFeeKurus: payment.merchantCommissionKurus,
        })
        .where(eq(payments.id, record.id));

      const open = record.unitId
        ? await tx
            .select()
            .from(debts)
            .where(
              and(
                eq(debts.unitId, record.unitId),
                isNull(debts.deletedAt),
                sql`${debts.status} NOT IN ('paid','written_off','cancelled')`,
                (record.debtorUserId ?? record.payerUserId)
                  ? eq(
                      debts.debtorUserId,
                      (record.debtorUserId ?? record.payerUserId)!,
                    )
                  : isNull(debts.debtorUserId),
              ),
            )
            .for("update")
        : [];

      /*
       * MAHSUP EDİLEN TUTAR `paidPrice` DEĞİL.
       *
       * `paidPrice` sağlayıcının **çektiği** tutar; komisyonu sakin
       * karşılıyorsa borcun üstüne komisyon da eklenmiş oluyor. Onu olduğu
       * gibi borçlara dağıtmak, sakine ödemediği kadar borç kapatmak —
       * sitenin parasını komisyon olarak ikinci kez ödemesi demekti.
       * Mahsup edilecek olan, ödeme açılırken kaydedilen borç tutarı.
       *
       * Yine de çekilen tutarla sınırlanıyor: sağlayıcı beklenenden azını
       * tahsil ettiyse (kısmi iade, kur farkı) borca yazılabilecek olan
       * gerçekten tahsil edilendir.
       */
      const settleable = Math.min(record.amountKurus, payment.paidPriceKurus);

      const allocation = allocatePayment(
        settleable,
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
        // H-12: Aynı (payment_id, debt_id) için DB unique constraint + ON CONFLICT
        // DO NOTHING. İki eşzamanlı webhook ilk transaction SELECT FOR UPDATE
        // ile sıralansa da, idempotency kontrolünü DB'ye yaklaştırmak savunmayı
        // derinleştirir.
        await tx
          .insert(paymentAllocations)
          .values({
            tenantId: record.tenantId,
            paymentId: record.id,
            debtId: a.debtId,
            amountKurus: a.amountKurus,
          })
          .onConflictDoNothing({
            target: [paymentAllocations.paymentId, paymentAllocations.debtId],
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

    return { ok: true, amount: formatKurus(payment.paidPriceKurus) };
  }
}

const callbackSchema = z.object({ token: z.string().min(1) });
