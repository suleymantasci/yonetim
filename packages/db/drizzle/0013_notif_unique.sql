-- =============================================================================
-- 0013 — notifications unique index (M-27)
-- Aynı kullanıcı + resource + template kombinasyonu için duplicate bildirim
-- yazılmasın. BullMQ retry'ları aynı event'i tekrar işlerse çift SMS/WhatsApp
-- gitmesini DB seviyesinde engelliyor.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_notif_user_resource_template
  ON notifications (user_id, resource_type, resource_id, template);
