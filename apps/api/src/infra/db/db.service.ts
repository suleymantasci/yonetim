import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";

import {
  withBypassRls,
  withPlatform,
  withTenant,
  type Database,
} from "@yonetim/db";

import type { ClsStore } from "../cls/request-context";

/**
 * Veritabanına **tek kapı** — MIMARI-PLAN §8.2.
 *
 * Bugün `withTenant` / `withPlatform` / `withBypassRls` 199 ayrı yerde elle
 * çağrılıyor. Bu sınıf o 199 çağrıyı tek noktaya indiriyor; kazancı yalnız
 * derli topluluk değil:
 *
 *  - RLS bağlamı **her zaman** transaction-local (`set_config(..., true)`),
 *    dolayısıyla connection pool'da sızma olamaz;
 *  - baypas artık **otomatik denetimli** — gerekçesiz baypas mümkün değil;
 *  - gerekçe (GAP-DURUM kararı 9) DB trigger'ının okuduğu oturum değişkenine
 *    tek yerde yazılıyor.
 *
 * §8.3 değişmez 1: `getDb()` / `getAdminDb()` yalnız bu dosyadan çağrılabilir;
 * kural `dependency-cruiser` ile makine tarafından zorlanıyor (§15).
 */
@Injectable()
export class DbService {
  private readonly logger = new Logger(DbService.name);

  constructor(private readonly cls: ClsService<ClsStore>) {}

  /**
   * Tenant kapsamlı transaction. Repository'ler **yalnız** bunu kullanır.
   * Bağlam yoksa fail-closed: boş sonuç dönmek yerine 403.
   */
  async tx<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const ctx = this.cls.get("ctx");
    if (!ctx?.tenantId) throw new ForbiddenException("tenant_context_missing");
    return withTenant(ctx.tenantId, fn, {
      userId: ctx.userId,
      role: ctx.roles[0],
    });
  }

  /**
   * Gerekçeli düzeltme — GAP-DURUM kararı 9.
   *
   * Gerekçe `app.change_reason` oturum değişkenine yazılır; denetim trigger'ı
   * onu okuyup kütüğe geçirir. 10 karakter eşiği `packages/contracts`
   * `changeReason` alanıyla aynı — iki taraf da aynı kuralı zorluyor.
   */
  async txWithReason<T>(
    reason: string,
    fn: (tx: Database) => Promise<T>,
  ): Promise<T> {
    if ((reason ?? "").trim().length < 10)
      throw new BadRequestException("reason_required");
    return this.tx(async (tx) => {
      await tx.execute(
        sql`SELECT set_config('app.change_reason', ${reason}, true)`,
      );
      return fn(tx);
    });
  }

  /** Platform (tenant'sız) — abonelik, plan, kampanya. RLS'i baypas etmez. */
  platform<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    return withPlatform(fn);
  }

  /**
   * RLS baypası — GAP-DURUM kararı 14 korunuyor: gerekçe zorunlu, kapsam dar.
   *
   * Ek olarak her çağrı otomatik olarak yapılandırılmış log'a düşüyor. 199
   * dağınık çağrıyı tek kapıya indirmenin somut kazancı bu: "kim, ne zaman,
   * hangi gerekçeyle RLS'i baypas etti" sorusunun tek bir cevabı var.
   */
  async bypass<T>(
    reason: string,
    fn: (tx: Database) => Promise<T>,
    opts: { allowLogPurge?: boolean } = {},
  ): Promise<T> {
    if ((reason ?? "").trim().length < 3) {
      throw new BadRequestException("bypass_reason_required");
    }
    const ctx = this.cls.get("ctx");
    this.logger.warn({
      event: "rls.bypass",
      reason,
      userId: ctx?.userId,
      tenantId: ctx?.tenantId,
      requestId: ctx?.requestId,
    });
    return withBypassRls(reason, fn, opts);
  }

  /** Bağlamı okumak isteyen servisler için tek erişim noktası. */
  ctx() {
    const ctx = this.cls.get("ctx");
    if (!ctx) throw new ForbiddenException("request_context_missing");
    return ctx;
  }

  /** Bağlam yoksa `undefined` — açılış/health gibi bağlamsız yollar için. */
  maybeCtx() {
    return this.cls.get("ctx");
  }
}
