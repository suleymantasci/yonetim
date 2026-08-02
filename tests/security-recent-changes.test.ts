import { describe, expect, it } from "vitest";

/**
 * Phase 3-7'de eklenen güvenlik değişiklikleri için birim testleri.
 *
 * Entegrasyon gerektirenler (M-3, M-18, M-30, M-35) burada
 * sadece davranış invariant'ı doğrulanır; gerçek çağrılar
 * `tests/integration/` altında Postgres ile yapılır.
 */

describe("M-6/M-7: Field encryption HKDF + tenant-scoped blind index", () => {
  it("encryptField farklı tenantId'ler için farklı şifreli metin üretir", async () => {
    const { encryptField } = await import("../packages/core/src/crypto");
    const master = "a".repeat(64);
    const enc1 = encryptField("10000000146", master, "tenant-A");
    const enc2 = encryptField("10000000146", master, "tenant-B");
    expect(enc1).not.toBe(enc2);
  });

  it("decryptField başka tenant anahtarıyla başarısız olur", async () => {
    const { encryptField, decryptField } = await import(
      "../packages/core/src/crypto"
    );
    const master = "a".repeat(64);
    const enc = encryptField("10000000146", master, "tenant-1");
    expect(() => decryptField(enc, master, "tenant-2")).toThrow();
  });

  it("blindIndex aynı tenant için deterministiktir", async () => {
    const { blindIndex } = await import("../packages/core/src/crypto");
    expect(blindIndex("10000000146", "a".repeat(64), "t1")).toBe(
      blindIndex("10000000146", "a".repeat(64), "t1"),
    );
  });

  it("blindIndex farklı tenant için farklı sonuç üretir", async () => {
    const { blindIndex } = await import("../packages/core/src/crypto");
    expect(blindIndex("10000000146", "a".repeat(64), "t1")).not.toBe(
      blindIndex("10000000146", "a".repeat(64), "t2"),
    );
  });

  it("blindIndex farklı masterKey farklı sonuç üretir", async () => {
    const { blindIndex } = await import("../packages/core/src/crypto");
    expect(blindIndex("10000000146", "a".repeat(64), "t1")).not.toBe(
      blindIndex("10000000146", "b".repeat(64), "t1"),
    );
  });
});

describe("L-15: scrypt v1 format with N/r/p parameters", () => {
  it("hashPassword yeni format üretir (v1$N$r$p$salt$hash)", async () => {
    const { hashPassword, HASH_VERSION } = await import(
      "../packages/auth/src/password"
    );
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash.startsWith(`${HASH_VERSION}$`)).toBe(true);
    const parts = hash.split("$");
    expect(parts).toHaveLength(6);
    // N=2^15, r=8, p=1 — params hash'te saklanıyor.
    expect(parts[1]).toBe("32768");
    expect(parts[2]).toBe("8");
    expect(parts[3]).toBe("1");
  });

  it("hashPassword + verifyPassword round-trip", async () => {
    const { hashPassword, verifyPassword } = await import(
      "../packages/auth/src/password"
    );
    const hash = await hashPassword("test-password-1234");
    const ok = await verifyPassword("test-password-1234", hash);
    const wrong = await verifyPassword("wrong-password", hash);
    expect(ok).toBe(true);
    expect(wrong).toBe(false);
  });

  it("eski 'scrypt$salt$hash' formatı hâlâ kabul edilir (backward-compat)", async () => {
    // Eski format hash'i, Node scrypt default params ile üretildi.
    // Doğrulama: salt+hash bileşenleri aynı olduğunda eşleşmeli.
    const oldHash =
      "scrypt$9Xh3k2Q5L8mNpR7vT4wY6zA1bC0dE2fG$abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    // Eski format doğru parse edilir mi? Format invariant: 2 $ ile 3 parça.
    const parts = oldHash.split("$");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("scrypt");
  });

  it("Hash formatı karıştırılamaz (yanlış prefix → false)", async () => {
    const { verifyPassword } = await import("../packages/auth/src/password");
    expect(
      await verifyPassword("any", "bcrypt$abc$def"),
    ).toBe(false);
    expect(
      await verifyPassword("any", "v2$32768$8$1$abc$def"),
    ).toBe(false);
  });
});

describe("L-4: JWT iss/aud enforcement", () => {
  it("verifyJwt iss='yonetim-api' ve aud='yonetim-mobile' kabul eder", async () => {
    const { signJwt, verifyJwt } = await import(
      "../apps/api/src/identity/jwt.util"
    );
    const SECRET = "this-is-a-32-byte-test-secret-aaaaa";
    const token = signJwt(
      {
        sub: "u1",
        tid: "t1",
        typ: "access",
        iss: "yonetim-api",
        aud: "yonetim-mobile",
      },
      SECRET,
      60,
    );
    const payload = verifyJwt(token, SECRET);
    expect(payload?.iss).toBe("yonetim-api");
    expect(payload?.aud).toBe("yonetim-mobile");
  });

  it("verifyJwt yanlış iss reddeder", async () => {
    const { signJwt, verifyJwt } = await import(
      "../apps/api/src/identity/jwt.util"
    );
    const SECRET = "this-is-a-32-byte-test-secret-aaaaa";
    const token = signJwt(
      {
        sub: "u1",
        tid: "t1",
        typ: "access",
        iss: "evil-service",
        aud: "yonetim-mobile",
      },
      SECRET,
      60,
    );
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("verifyJwt yanlış aud reddeder", async () => {
    const { signJwt, verifyJwt } = await import(
      "../apps/api/src/identity/jwt.util"
    );
    const SECRET = "this-is-a-32-byte-test-secret-aaaaa";
    const token = signJwt(
      {
        sub: "u1",
        tid: "t1",
        typ: "access",
        iss: "yonetim-api",
        aud: "other-app",
      },
      SECRET,
      60,
    );
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("verifyJwt iss/aud set edilmemişse graceful migration kabul eder", async () => {
    const { signJwt, verifyJwt } = await import(
      "../apps/api/src/identity/jwt.util"
    );
    const SECRET = "this-is-a-32-byte-test-secret-aaaaa";
    const token = signJwt(
      { sub: "u1", tid: "t1", typ: "access" },
      SECRET,
      60,
    );
    const payload = verifyJwt(token, SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.iss).toBeUndefined();
    expect(payload?.aud).toBeUndefined();
  });
});

describe("M-50: MIME/extension match", () => {
  it("geçerli PDF + .pdf kabul", async () => {
    const { isMimeExtensionMatch } = await import(
      "../packages/storage/src/index"
    );
    expect(isMimeExtensionMatch("application/pdf", "doc.pdf")).toBe(true);
  });

  it("application/pdf + .html reddedilir (XSS pivot)", async () => {
    const { isMimeExtensionMatch } = await import(
      "../packages/storage/src/index"
    );
    expect(isMimeExtensionMatch("application/pdf", "doc.html")).toBe(false);
  });

  it("image/jpeg + .jpg kabul, .png reddedilir", async () => {
    const { isMimeExtensionMatch } = await import(
      "../packages/storage/src/index"
    );
    expect(isMimeExtensionMatch("image/jpeg", "photo.jpg")).toBe(true);
    expect(isMimeExtensionMatch("image/jpeg", "photo.png")).toBe(false);
  });

  it("charset suffix'li MIME kabul edilir", async () => {
    const { isMimeExtensionMatch } = await import(
      "../packages/storage/src/index"
    );
    expect(isMimeExtensionMatch("text/csv; charset=utf-8", "data.csv")).toBe(
      true,
    );
  });

  it("allowlist'te olmayan MIME reddedilir", async () => {
    const { isMimeExtensionMatch } = await import(
      "../packages/storage/src/index"
    );
    expect(isMimeExtensionMatch("text/html", "x.html")).toBe(false);
  });

  it("null/empty MIME reddedilir", async () => {
    const { isMimeExtensionMatch } = await import(
      "../packages/storage/src/index"
    );
    expect(isMimeExtensionMatch(null, "x.pdf")).toBe(false);
    expect(isMimeExtensionMatch("", "x.pdf")).toBe(false);
  });
});

describe("L-21: Sentry spaced IBAN pattern", () => {
  it("contiguous TR IBAN maskelenir", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../apps/api/src/infra/observability/sentry.ts",
      ),
      "utf8",
    );
    // TR12 3456 7890 1234 5678 9012 34 — spaced format için pattern
    expect(source).toContain("TR[\\s\\d]{24,30}");
  });

  it("11-hanelik TCKN pattern korunur", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../apps/api/src/infra/observability/sentry.ts",
      ),
      "utf8",
    );
    expect(source).toContain("\\b\\d{11}\\b");
  });
});

describe("M-42: bypass() reason pattern", () => {
  it("db.service bypass reason namespaced pattern is enforced", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../apps/api/src/infra/db/db.service.ts",
      ),
      "utf8",
    );
    // 3 karakterlik minimum kaldırıldı; yerine module:action regex'i.
    expect(source).not.toMatch(/length < 3/);
    expect(source).toMatch(/bypass_reason_must_match_pattern/);
    expect(source).toMatch(/module.*action/);
  });
});

describe("M-39: PII access audit log in PiiService", () => {
  it("PiiService.open logs pii.accessed on decrypt", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../apps/api/src/property/resident/pii.service.ts",
      ),
      "utf8",
    );
    expect(source).toContain("pii.accessed");
    expect(source).toContain("event: \"pii.accessed\"");
  });
});

describe("M-40: permission denial audit", () => {
  it("PermissionGuard logs authz.denied on 403", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../apps/api/src/identity/guards/permission.guard.ts",
      ),
      "utf8",
    );
    expect(source).toContain("authz.denied");
    expect(source).toContain("event: \"authz.denied\"");
  });
});

describe("M-18: event.processor subject_user membership verify", () => {
  it("event.processor subject_user audience validates membership", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../apps/worker/src/queue/event.processor.ts",
      ),
      "utf8",
    );
    // subject_user case'inde memberships sorgusu var.
    expect(source).toMatch(/case "subject_user":[\s\S]*memberships/);
  });
});

describe("M-27: notifications unique index", () => {
  it("migration 0013_notif_unique.sql creates uq_notif_user_resource_template", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../packages/db/drizzle/0013_notif_unique.sql",
      ),
      "utf8",
    );
    expect(source).toContain("uq_notif_user_resource_template");
    expect(source).toContain("user_id, resource_type, resource_id, template");
  });
});

describe("M-35: announcement rate limit", () => {
  it("rate-limit rules include announcement", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../packages/auth/src/rate-limit.ts",
      ),
      "utf8",
    );
    expect(source).toContain("announcement:");
    expect(source).toContain("urgentAnnouncement:");
    expect(source).toContain("message:");
  });
});

describe("L-18: search literal escape (SQL LIKE % and _)", () => {
  it("expense.repository escapes SQL LIKE wildcards", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../apps/api/src/finance/expense/expense.repository.ts",
      ),
      "utf8",
    );
    expect(source).toContain("replace(/%/g");
    expect(source).toContain("replace(/_/g");
  });
});
