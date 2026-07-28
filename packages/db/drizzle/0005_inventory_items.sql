-- Demirbaş / envanter defteri — KMK md.34/9, rakip incelemesi §4.1.
--
-- Yönetici ortak yer eşyasını korumak ve devir teslimde hesabını vermekle
-- yükümlü; bugüne kadar bu liste sistemde hiç yoktu (Excel'de tutuluyordu).
--
-- `disposed` (hurdaya ayrıldı) ile `lost` (kayıp) bilinçli olarak ayrı: ilki
-- yönetim kararıyla düşülen, ikincisi hesabı sorulacak bir eksik. Tek "pasif"
-- durumda toplamak devir teslimdeki asıl soruyu ("eksik ne var") cevapsız
-- bırakırdı.
--
-- `tenant_id` sütunu olduğu için `rls.sql` politikayı **otomatik** uyguluyor.
CREATE TYPE "public"."inventory_status" AS ENUM (
  'active', 'in_repair', 'broken', 'disposed', 'lost'
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "inventory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  -- Etikette yazan envanter numarası; isteğe bağlı.
  "code" varchar(40),
  "name" varchar(160) NOT NULL,
  "category" varchar(40) DEFAULT 'other' NOT NULL,
  -- Serbest metin: demirbaşların çoğu ortak alanda ve ortak alanların hepsi
  -- `units` satırı değil (kazan dairesi, sığınak, blok girişi).
  "location" varchar(120),
  "quantity" integer DEFAULT 1 NOT NULL,
  "serial_no" varchar(80),
  "purchase_date" timestamp with time zone,
  "purchase_price_kurus" bigint DEFAULT 0 NOT NULL,
  "warranty_until" timestamp with time zone,
  "status" "public"."inventory_status" DEFAULT 'active' NOT NULL,
  "responsible_staff_id" uuid,
  "notes" text,
  "photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);--> statement-breakpoint

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Zimmetli personel silinirse zimmet düşer, demirbaş kalır: `SET NULL`.
-- `CASCADE` olsaydı bir personel kaydını silmek demirbaşları da götürürdü.
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_responsible_staff_id_staff_id_fk"
  FOREIGN KEY ("responsible_staff_id") REFERENCES "public"."staff"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "idx_inventory_tenant_status"
  ON "inventory_items" USING btree ("tenant_id","status");--> statement-breakpoint

-- Envanter numarası site içinde tekil: iki demirbaşa aynı etiketi yapıştırmak
-- sayımı imkânsız kılar. Kısmi index, çünkü numara isteğe bağlı ve çöp
-- kutusundaki kayıt numarayı bloke etmemeli.
CREATE UNIQUE INDEX "idx_inventory_tenant_code"
  ON "inventory_items" USING btree ("tenant_id","code")
  WHERE "code" IS NOT NULL AND "deleted_at" IS NULL;
