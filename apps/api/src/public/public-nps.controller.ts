import { Body, Controller, Ip, Post } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { RATE_LIMITS, rateLimit } from "@yonetim/auth/rate-limit";
import { currentPeriod, errors, periodKey } from "@yonetim/core";
import { npsResponses, tenants } from "@yonetim/db";

import { Public } from "../identity/decorators";
import { DbService } from "../infra/db/db.service";

/**
 * Halka açık NPS widget'ı — SPEC Bölüm 3.8 / 6.14.
 *
 * `@Public()` ve kimlik bilgisi **toplamıyor**: `userId` bilerek `null`.
 * Anonim geri bildirim, kimliği kayda geçen geri bildirimden daha dürüst
 * olur; puanı veren kişiyi bilmek ürün kararı için gerekli değil.
 *
 * Kötüye kullanım kimlikle değil hız sınırıyla kapatılıyor: site + IP başına
 * `publicForm` limiti. Yalnız **yayınlanmış** landing sayfası olan siteler
 * puan alabiliyor — aksi halde uç, hangi slug'ın var olduğunu sorgulanabilir
 * hâle getirirdi.
 */
@ApiExcludeController()
@Controller("v1/public/nps")
export class PublicNpsController {
  constructor(private readonly db: DbService) {}

  @Post()
  @Public()
  async submit(@Body() body: unknown, @Ip() ip: string) {
    const input = submitSchema.parse(body ?? {});

    const limit = await rateLimit(
      RATE_LIMITS.publicForm,
      `${input.tenantSlug}:${ip || "anon"}`,
    );
    if (!limit.allowed) throw errors.rateLimited();

    const tenant = await this.db.bypass("nps:tenant", async (tx) => {
      const rows = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(
          and(
            eq(tenants.slug, input.tenantSlug),
            eq(tenants.landingPublished, true),
            isNull(tenants.deletedAt),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    });

    if (!tenant) throw errors.notFound("tenant_not_found");

    await this.db.bypass("nps:insert", async (tx) => {
      await tx.insert(npsResponses).values({
        tenantId: tenant.id,
        userId: null,
        period: periodKey(currentPeriod()),
        score: input.score,
        channel: "in_app",
      });
    });

    // Teşekkür metni Next tarafında çevriliyor: API dile bağımsız (SPEC 4.2).
    return { ok: true };
  }
}

const submitSchema = z.object({
  tenantSlug: z.string().trim().min(1).max(80),
  score: z.coerce.number().int().min(0).max(10),
});
