import { Controller, Get, Query } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { RATE_LIMITS, rateLimit } from "@yonetim/auth/rate-limit";
import type { CertificateVerifyResult } from "@yonetim/contracts";
import { errors } from "@yonetim/core";
import { debtCertificates, tenants } from "@yonetim/db";

import { Public } from "../identity/decorators";
import { DbService } from "../infra/db/db.service";

/**
 * Borcu yoktur belgesi doğrulama — SPEC Bölüm 3.6.
 *
 * Halka açık: belgeyi ibraz eden kişi, karşı tarafa (banka, tapu, kurum)
 * hesap açtıramaz. Buna karşılık yanıt **kişisel veri taşımıyor** — daire
 * numarası, sakin adı, borç kalemleri yok. Dönen tek şey belgenin gerçekliği.
 *
 * Seri numarası + doğrulama kodu **birlikte** aranıyor: seri numarası sıralı
 * ve tahmin edilebilir, kod değil. Yalnız seriyle arama, tüm belgelerin
 * durumunu numarayı artırarak taranabilir hâle getirirdi.
 *
 * Hız sınırı IP başına: kodu deneme yanılmayla bulmak, sınırsız denemede
 * mümkün olurdu.
 */
@ApiExcludeController()
@Controller("v1/public/certificates")
export class PublicCertificateController {
  constructor(private readonly db: DbService) {}

  @Get("verify")
  @Public()
  async verify(
    @Query() query: Record<string, string>,
  ): Promise<CertificateVerifyResult> {
    const input = verifySchema.parse(query);

    const limit = await rateLimit(RATE_LIMITS.publicForm, input.serialNo);
    if (!limit.allowed) throw errors.rateLimited();

    return this.db.bypass("certificate:verify", async (tx) => {
      const rows = await tx
        .select({
          result: debtCertificates.result,
          outstandingKurus: debtCertificates.outstandingKurus,
          asOfDate: debtCertificates.asOfDate,
          tenantName: tenants.name,
        })
        .from(debtCertificates)
        .innerJoin(tenants, eq(tenants.id, debtCertificates.tenantId))
        .where(
          and(
            eq(debtCertificates.serialNo, input.serialNo),
            eq(debtCertificates.verificationCode, input.code),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) return { valid: false as const };

      return {
        valid: true as const,
        tenantName: row.tenantName,
        asOfDate: row.asOfDate,
        result: row.result as "clear" | "outstanding",
        outstandingMinor: row.outstandingKurus,
      };
    });
  }
}

const verifySchema = z.object({
  serialNo: z.string().trim().min(1).max(40),
  // Kod büyük harfe normalize ediliyor: kullanıcı belgeden elle kopyalıyor.
  code: z
    .string()
    .trim()
    .min(4)
    .max(20)
    .transform((value) => value.toUpperCase()),
});
