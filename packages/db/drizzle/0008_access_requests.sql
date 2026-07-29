-- Sakin erişim talebi — `/kayit-talebi` (SPEC Bölüm 6.14).
--
-- NEDEN AYRI BİR TABLO, `memberships`'e doğrudan yazmak yerine: sitede oturan
-- ama sisteme tanımlanmamış bir kişi kendi üyeliğini açamaz. Açabilseydi
-- herkes istediği sitenin sakini olur, o sitenin duyurularını ve karar
-- defterini okurdu. Talep bu yüzden onay bekleyen bir kayıt; üyeliği yönetici
-- daire ve kimlik doğrulamasından sonra kendisi açıyor.
--
-- `user_id` NULLABLE: başvuran kişinin platformda hesabı olmayabilir. Eşleşme
-- (ya da yeni kullanıcı) onay anında kuruluyor.
--
-- REDDEDİLEN TALEP SİLİNMİYOR, kapatılıyor: "kim, ne zaman başvurdu ve neden
-- reddedildi" sorusu yöneticinin hesap verebilirliğinin parçası. Kayıtların
-- tasfiyesi KVKK saklama süresi işiyle birlikte yürüyor.
CREATE TABLE IF NOT EXISTS "access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid,
  "full_name" varchar(160) NOT NULL,
  "phone" varchar(20) NOT NULL,
  "email" varchar(255),
  -- Blok/daire serbest metin: yazım biçimi sitelere göre değişiyor ve
  -- başvuran kişi bizim birim kayıtlarımızı görmüyor.
  "block_label" varchar(60),
  "unit_label" varchar(40) NOT NULL,
  -- 'owner' | 'tenant' — beyan; yönetici onayda düzeltebilir.
  "claimed_relation" varchar(20) DEFAULT 'tenant' NOT NULL,
  "note" text,
  -- 'pending' | 'approved' | 'rejected'
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "unit_id" uuid,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "rejection_reason" text,
  "ip" varchar(45),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_tenant_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_access_requests_tenant_status"
  ON "access_requests" ("tenant_id", "status");--> statement-breakpoint

-- Aynı numaradan gelen talepleri yöneticiye tek yerde göstermek için.
CREATE INDEX IF NOT EXISTS "idx_access_requests_phone"
  ON "access_requests" ("phone");--> statement-breakpoint

-- Aynı kişi aynı daire için ikinci kez başvuramaz; ilk talep beklerken gelen
-- tekrarlar yöneticinin kuyruğunu şişiriyordu. Karara bağlanmış talepten
-- sonra yeniden başvuru serbest (kısmi index yalnız 'pending' satırlarda).
CREATE UNIQUE INDEX IF NOT EXISTS "idx_access_requests_pending_unique"
  ON "access_requests" ("tenant_id", "phone", "unit_label")
  WHERE "status" = 'pending';
