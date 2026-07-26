"use server";

import { and, count, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { readableCode } from "@yonetim/core/crypto";
import { debtCertificates, debts, units, withTenant } from "@yonetim/db";

import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/context";

/** SPEC Bölüm 3.6 — belge üretimi. */
export interface CertificateState {
  ok: boolean;
  message?: string;
  certificate?: {
    serialNo: string;
    verificationCode: string;
    result: "clear" | "outstanding";
    outstandingKurus: number;
    unitLabel: string;
    asOfDate: string;
  };
}

const schema = z.object({
  unitNumber: z.string().min(1),
  kepRecipient: z.string().optional(),
});

export async function issueDebtCertificate(
  _prev: CertificateState,
  formData: FormData,
): Promise<CertificateState> {
  const ctx = await requirePermission("debt:read");
  const t = await getTranslations("app.certificate");

  const parsed = schema.safeParse({
    unitNumber: String(formData.get("unitNumber") ?? "").trim(),
    kepRecipient: String(formData.get("kepRecipient") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: t("unitNumberRequired") };
  }

  const asOfDate = new Date();

  const result = await withTenant(
    ctx.tenantId,
    async (tx) => {
      const unitRows = await tx
        .select({ id: units.id, number: units.number })
        .from(units)
        .where(and(eq(units.number, parsed.data.unitNumber), isNull(units.deletedAt)))
        .limit(1);
      const unit = unitRows[0];
      if (!unit) return { error: t("unitNotFound") };

      const [balance] = await tx
        .select({
          outstanding: sql<number>`COALESCE(SUM(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}), 0)`,
        })
        .from(debts)
        .where(
          and(
            eq(debts.unitId, unit.id),
            isNull(debts.deletedAt),
            sql`${debts.status} <> 'paid'`,
          ),
        );

      const outstanding = Math.max(0, Number(balance?.outstanding ?? 0));
      const [seq] = await tx.select({ value: count() }).from(debtCertificates);
      const serialNo = `${outstanding === 0 ? "BYB" : "BDB"}-${asOfDate.getFullYear()}-${String(
        (seq?.value ?? 0) + 1,
      ).padStart(6, "0")}`;
      const verificationCode = readableCode(8);

      await tx.insert(debtCertificates).values({
        tenantId: ctx.tenantId,
        unitId: unit.id,
        requestedBy: ctx.userId,
        result: outstanding === 0 ? "clear" : "outstanding",
        outstandingKurus: outstanding,
        asOfDate,
        serialNo,
        verificationCode,
        kepRecipient: parsed.data.kepRecipient,
      });

      return {
        serialNo,
        verificationCode,
        result: (outstanding === 0 ? "clear" : "outstanding") as "clear" | "outstanding",
        outstandingKurus: outstanding,
        unitLabel: unit.number,
      };
    },
    { userId: ctx.userId },
  );

  if ("error" in result) return { ok: false, message: result.error };

  await audit(ctx, {
    action: "debt_certificate_issued",
    resource: "debt_certificate",
    resourceId: result.serialNo,
    reason: `${result.unitLabel} · ${result.result}`,
  });

  revalidatePath("/panel/borcu-yoktur");

  return {
    ok: true,
    message:
      result.result === "clear" ? t("createdClear") : t("createdOutstanding"),
    certificate: { ...result, asOfDate: asOfDate.toISOString() },
  };
}
