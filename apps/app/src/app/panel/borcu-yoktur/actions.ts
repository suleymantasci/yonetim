"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { debtCertificateIssueResult } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";

import { apiPost } from "@/lib/api/server";
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

/**
 * Belge üretimi — sunum tarafı.
 *
 * Bakiye hesabı, seri numarası üretimi ve denetim kaydı `apps/api`'de:
 * seri numarasının tekilliği tek transaction içinde sayaçtan türemeye bağlı
 * ve bu garanti render katmanında verilemezdi.
 */
export async function issueDebtCertificate(
  _prev: CertificateState,
  formData: FormData,
): Promise<CertificateState> {
  await requirePermission("debt:read");
  const t = await getTranslations("app.certificate");

  const parsed = schema.safeParse({
    unitNumber: String(formData.get("unitNumber") ?? "").trim(),
    kepRecipient:
      String(formData.get("kepRecipient") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: t("unitNumberRequired") };
  }

  let issued;
  try {
    issued = await apiPost(
      "/v1/panel/certificates",
      {
        unitNumber: parsed.data.unitNumber,
        kepRecipient: parsed.data.kepRecipient,
      },
      debtCertificateIssueResult,
    );
  } catch (error) {
    // "Daire bulunamadı" kullanıcıya gösterilecek bir durum, beklenmeyen bir
    // hata değil; diğerleri yukarı geçsin ki error.tsx yakalasın.
    if (error instanceof AppError && error.code === "not_found") {
      return { ok: false, message: t("unitNotFound") };
    }
    throw error;
  }

  return {
    ok: true,
    message:
      issued.result === "clear" ? t("createdClear") : t("createdOutstanding"),
    certificate: {
      serialNo: issued.serialNo,
      verificationCode: issued.verificationCode,
      result: issued.result,
      outstandingKurus: issued.outstandingMinor,
      unitLabel: issued.unitLabel,
      asOfDate: issued.asOfDate.toISOString(),
    },
  };
}
