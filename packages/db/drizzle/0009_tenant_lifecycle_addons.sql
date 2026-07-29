-- Site yaşam döngüsü ve satın alınan ek paketler (2026-07-29 kararları).
--
-- 1) SİTE PASİFE ALMA + GERİ KURTARMA
--
-- `tenant_status` enum'unda `archived` zaten vardı ama onu yazan tek satır kod
-- yoktu: yönetim bir siteyle işini bitirdiğinde yapabileceği hiçbir şey yoktu,
-- site sonsuza kadar aktif kalıyordu. Durum sütunu **ne** olduğunu söylüyor,
-- **ne zaman** ve **kimin kararıyla** olduğunu söylemiyor; kurtarma penceresini
-- hesaplamak için ilkine, hesap verebilirlik için ikincisine ihtiyaç var.
--
-- `purge_after_at` süreyi satırın kendisinde tutuyor, config'den her okumada
-- yeniden hesaplanmıyor: pencere uzunluğu (bugün 90 gün) sonra kısaltılırsa, o
-- sırada arşivde bekleyen sitelere verilmiş tarih değişmemeli. Yöneticiye "90
-- gün içinde geri alabilirsin" deyip sonra 30 güne çekmek, kurtarma sözünün
-- ihlali olurdu.
--
-- `status_before_archive`: geri açış "aktif yap" değil, "eski hâline döndür"
-- olmalı. Denemedeyken arşivlenen site geri açıldığında `active` olursa,
-- ödemesi alınmamış bir hesabı ücretli duruma taşımış oluruz.
ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "archived_by" uuid,
  ADD COLUMN IF NOT EXISTS "purge_after_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "status_before_archive" "tenant_status";--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "tenants" ADD CONSTRAINT "tenants_archived_by_fk"
    FOREIGN KEY ("archived_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Tasfiye job'ı "süresi dolmuş arşiv" sorgusunu bu index'le tarıyor.
CREATE INDEX IF NOT EXISTS "idx_tenants_purge_after"
  ON "tenants" ("purge_after_at");--> statement-breakpoint

-- 2) SATIN ALINAN EK PAKETLER (SMS / WhatsApp kredisi)
--
-- Plan içi hediye kota (`plans.sms_quota_yearly`) ile dönem sonunda faturalanan
-- aşım (`invoices.sms_overage_count`) arasında hiçbir şey yoktu: yönetici
-- kotasını bitirdiğinde ya aşım ücretine razı olacaktı ya susacaktı, **önden
-- kredi satın alma** yolu yoktu. Süper-admin panelindeki "bu hesabın hangi
-- paketleri var" sorusu da bu yüzden cevapsızdı.
--
-- `remaining_quantity` türetilmiyor, tutuluyor: kalanı her okumada
-- `notifications` üzerinden saymak, kota kontrolünü tam da en sık çağrılan
-- yolda (her bildirim gönderimi) ağırlaştırırdı. Sayaç gönderimle aynı
-- işlemde düşer.
--
-- `valid_until` NULLABLE: kampanya motorunun `credit_balance` ödülü süresiz
-- bakiye verebiliyor; son kullanma tarihini zorunlu kılmak o ödülü ifade
-- edilemez hâle getirirdi.
CREATE TABLE IF NOT EXISTS "tenant_addons" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  -- 'sms' | 'whatsapp' — kanal başına ayrı bakiye.
  "kind" varchar(20) NOT NULL,
  "name" varchar(120) NOT NULL,
  "purchased_quantity" integer NOT NULL,
  "remaining_quantity" integer NOT NULL,
  "unit_price_kurus" bigint DEFAULT 0 NOT NULL,
  "total_price_kurus" bigint DEFAULT 0 NOT NULL,
  "invoice_id" uuid,
  -- 'purchase' | 'campaign_gift' | 'manual_grant'
  "source" varchar(20) DEFAULT 'purchase' NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone,
  -- 'active' | 'depleted' | 'expired' | 'revoked'
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "granted_by" uuid,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_tenant_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_invoice_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_granted_by_fk"
    FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- Bakiye negatife düşemez: kredi düşme işlemi yarış koşulunda iki kez
-- çalışırsa uygulama katmanı değil veritabanı reddetmeli.
DO $$ BEGIN
  ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_remaining_nonneg"
    CHECK ("remaining_quantity" >= 0 AND "remaining_quantity" <= "purchased_quantity");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_tenant_addons_tenant"
  ON "tenant_addons" ("tenant_id");--> statement-breakpoint

-- Kredi düşerken "bu kanalda aktif paket var mı" sorgusu.
CREATE INDEX IF NOT EXISTS "idx_tenant_addons_tenant_kind_status"
  ON "tenant_addons" ("tenant_id", "kind", "status");
