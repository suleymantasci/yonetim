import { NextResponse } from "next/server";

/**
 * Sağlık kontrolü — SPEC Bölüm 19.3, MIMARI-PLAN §11.
 *
 * Bu prob **yalnız render sürecini** ölçüyor. Eskiden buradan `SELECT 1`
 * atılıyordu; artık atılamaz (§8.3 değişmez 3) ve atılmamalı da: veritabanı
 * bir saniye takıldığında orchestrator'ın web container'ını yeniden başlatması
 * durumu düzeltmez, sadece kullanıcıyı da kaybettirir.
 *
 * Veritabanı ve Redis sağlığı `apps/api`'nin `/health/ready` probunda —
 * bağımlılığın sahibi orası.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "app",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
