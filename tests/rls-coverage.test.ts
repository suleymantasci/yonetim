import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * C-4 / H-8 (SECURITY-REVIEW.md): Yeni eklenen tenant tablosu RLS'siz
 * kalmamalı. `rls.sql` artık:
 *  - Mevcut tabloları `tenant_id` sütununa göre ENABLE/FORCE RLS ile döngüde yürütüyor.
 *  - Yeni eklenen tablolar için `ddl_command_end` event trigger tetikleniyor
 *    ve aynı politika otomatik uygulanıyor.
 *
 * Bu test, `rls.sql` kaynak kodunda bu iki mekanizmanın varlığını doğrular.
 * Tam entegrasyon (gerçek Postgres + yeni tablo) `tests/integration/` altında
 * çalıştırılır; bu statik kontrol CI'da hızlı kapsama sağlar.
 */
describe("RLS kapsama (packages/db/sql/rls.sql)", () => {
  const source = readFileSync(
    new URL("../packages/db/sql/rls.sql", import.meta.url).pathname,
    "utf8",
  );

  it("dynamic loop tüm tenant_id tablolarını RLS'liyor", () => {
    expect(source).toMatch(/pg_class/);
    expect(source).toMatch(/ALTER TABLE public\.\%I ENABLE ROW LEVEL SECURITY/);
    expect(source).toMatch(/ALTER TABLE public\.\%I FORCE ROW LEVEL SECURITY/);
    expect(source).toMatch(/CREATE POLICY tenant_isolation/);
  });

  it("event trigger yeni tablolar için otomatik RLS uygular", () => {
    expect(source).toMatch(/CREATE EVENT TRIGGER/);
    expect(source).toMatch(/ddl_command_end/);
    expect(source).toMatch(
      /app_attach_tenant_isolation|trg_attach_tenant_isolation/,
    );
  });

  it("app_current_tenant() fail-closed (unset → NULL)", () => {
    expect(source).toMatch(
      /app_current_tenant.*RETURNS uuid[\s\S]*NULLIF\(current_setting/,
    );
  });

  it("audit_logs ve data_access_logs append-only", () => {
    expect(source).toMatch(/app_forbid_log_update/);
    expect(source).toMatch(/app_guard_log_delete/);
    expect(source).toMatch(/audit_logs/);
    expect(source).toMatch(/data_access_logs/);
  });

  it("rol parolaları hardcoded değil (C-5)", () => {
    // "PASSWORD 'literal'" kalıbı artık dosyada olmamalı.
    expect(source).not.toMatch(/PASSWORD\s+'yonetim_app'/);
    expect(source).not.toMatch(/PASSWORD\s+'yonetim_admin'/);
    // GUC'lerden okunmalı.
    expect(source).toMatch(/app\.app_role_password/);
    expect(source).toMatch(/app\.admin_role_password/);
  });
});
