-- Borç türüne Kira / Depozito / İdari Ceza — 2026-07-28 rakip incelemesi.
--
-- Üçü de bugüne kadar `extra` ("Ek tahakkuk") altına yazılıyordu. `extra` bir
-- kova olduğu için "geçen yıl ortak alan kira geliri ne kadardı" ya da
-- "kaç daireden depozito aldık" soruları kayıtlardan cevaplanamıyordu.
--
-- `penalty` ile `admin_fine` bilinçli olarak ayrı: ilki yönetimin kendi
-- kararıyla kestiği ceza (yönetim planı ihlali), ikincisi kamu kurumunun
-- siteye kesip dairelere yansıtılan ceza. İtiraz mercileri ve muhasebe
-- karşılıkları farklı olduğu için tek kalemde toplanamazlar.
--
-- `ADD VALUE` değeri enum'un **sonuna** ekler; `packages/db/src/schema/enums.ts`
-- içindeki dizinin sırası bununla aynı tutulmalı.
--
-- `IF NOT EXISTS` idempotent kurulum için: `pnpm db:migrate` aynı veritabanına
-- iki kez uygulanırsa ikinci koşu hata vermez.
ALTER TYPE "public"."debt_kind" ADD VALUE IF NOT EXISTS 'rent';--> statement-breakpoint
ALTER TYPE "public"."debt_kind" ADD VALUE IF NOT EXISTS 'deposit';--> statement-breakpoint
ALTER TYPE "public"."debt_kind" ADD VALUE IF NOT EXISTS 'admin_fine';
