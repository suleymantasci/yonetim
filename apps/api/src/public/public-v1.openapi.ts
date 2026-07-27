import { siteConfig } from "@yonetim/config";

/**
 * OpenAPI 3.1 açıklaması — SPEC Bölüm 21.2, GAP 4.8.3.
 *
 * Kasıtlı olarak **elle yazıldı**, şemadan üretilmedi. Gerekçe: `/api/v1`
 * yüzeyi küçük ve kararlı; kod üreteci eklemek (zod-to-openapi + build adımı)
 * bakım maliyetini şu ölçekte hak etmiyor. Yüzey büyürse üreteci getirmek
 * doğru olur — bu dosya o zaman silinir.
 *
 * Panel yüzeyinin (`/v1/panel/*`) Swagger dokümanı ayrı ve **üretiliyor**:
 * o yüzey ekranla birlikte değiştiği için elle bakım yapılamaz. Bu doküman
 * ise donuk bir sözleşmeyi anlatıyor; elle yazılmış olması onun özelliği.
 *
 * Kimlik doğrulama, hata zarfı ve sayfalama sözleşmesi burada tek yerde
 * tanımlı; entegrasyon yazan geliştirici başka yere bakmak zorunda kalmıyor.
 */

const paginationParams = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "pageSize",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
  },
  { name: "q", in: "query", schema: { type: "string", maxLength: 100 } },
  { name: "sort", in: "query", schema: { type: "string" } },
  { name: "direction", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
];

const errorResponse = {
  description: "Hata",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

export const OPENAPI_V1_DOCUMENT = {
    openapi: "3.1.0",
    info: {
      title: `${siteConfig.brand.name} API`,
      version: "1.0.0",
      description:
        "Site yönetimi verilerine dış erişim. Panel arayüzü bu uçları kullanmaz " +
        "(Server Action kullanır); burası muhasebe yazılımı, yönetim şirketi paneli " +
        "ve mobil uygulama entegrasyonları içindir.\n\n" +
        "Tüm istekler tenant kapsamındadır: bir API anahtarı yalnız kendi sitesinin " +
        "verisini görür (Postgres RLS ile garanti edilir).",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          description:
            "`Authorization: Bearer yk_live_...` biçiminde API anahtarı. " +
            "Anahtar hash'lenmiş saklanır ve yalnız üretim anında bir kez gösterilir. " +
            "Alternatif olarak oturum çerezi de kabul edilir (panelin kendi istemci kodu için).",
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "unauthorized",
                    "forbidden",
                    "not_found",
                    "validation",
                    "conflict",
                    "rate_limited",
                    "tenant_mismatch",
                    "internal",
                  ],
                },
                message: { type: "string" },
                details: {},
              },
            },
          },
        },
        ListMeta: {
          type: "object",
          properties: {
            page: { type: "integer" },
            pageSize: { type: "integer" },
            total: { type: "integer" },
            pageCount: { type: "integer" },
          },
        },
        Unit: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            number: { type: "string" },
            blockId: { type: "string", format: "uuid", nullable: true },
            blockName: { type: "string", nullable: true },
            floor: { type: "integer" },
            type: {
              type: "string",
              enum: ["flat", "shop", "office", "depot", "garage", "villa", "common_area"],
            },
            areaM2: { type: "string", nullable: true, description: "m², ondalık metin" },
            landShare: {
              type: "string",
              nullable: true,
              description: "Ondalık arsa payı oranı (kanonik değer)",
            },
            landShareNumerator: { type: "integer", nullable: true },
            landShareDenominator: { type: "integer", nullable: true },
            residentCount: { type: "integer" },
            ownershipType: { type: "string", enum: ["owner", "tenant", "vacant"] },
            duesExempt: { type: "boolean" },
            lateFeeExempt: { type: "boolean" },
            duesMultiplier: { type: "string" },
          },
        },
        Debt: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            unitId: { type: "string", format: "uuid" },
            unitNumber: { type: "string" },
            debtorUserId: { type: "string", format: "uuid", nullable: true },
            kind: {
              type: "string",
              enum: ["dues", "utility", "reservation", "penalty", "late_fee", "extra", "legal_cost"],
            },
            description: { type: "string" },
            period: { type: "string", nullable: true, example: "2026-07" },
            amountKurus: { type: "integer", description: "Kuruş cinsinden tam sayı" },
            paidKurus: { type: "integer" },
            lateFeeKurus: { type: "integer" },
            outstandingKurus: {
              type: "integer",
              description: "amount + lateFee - paid (sunucuda hesaplanır)",
            },
            dueDate: { type: "string", format: "date-time" },
            status: {
              type: "string",
              enum: ["pending", "partial", "paid", "overdue", "in_legal", "written_off", "cancelled"],
            },
            lateFeeExempt: { type: "boolean" },
          },
        },
        Expense: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            description: { type: "string" },
            categoryId: { type: "string", format: "uuid", nullable: true },
            categoryName: { type: "string", nullable: true },
            vendorName: { type: "string", nullable: true },
            amountKurus: { type: "integer", description: "KDV dahil toplam" },
            vatKurus: { type: "integer", description: "Orandan türetilir" },
            vatRate: { type: "string", example: "0.20" },
            withholdingKurus: { type: "integer" },
            invoiceNo: { type: "string", nullable: true },
            expenseDate: { type: "string", format: "date-time" },
            status: {
              type: "string",
              enum: ["draft", "pending_approval", "approved", "paid", "rejected"],
            },
            distributedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "Dolu ise gider dairelere yansıtılmış ve değiştirilemez",
            },
          },
        },
        Resident: {
          type: "object",
          description:
            "KVKK veri minimizasyonu: telefon maskeli döner, TCKN hiç dönmez.",
          properties: {
            id: { type: "string", format: "uuid" },
            firstName: { type: "string", nullable: true },
            lastName: { type: "string", nullable: true },
            phoneMasked: { type: "string", nullable: true, example: "+90 5** *** ** 34" },
            email: { type: "string", nullable: true },
            whatsappOptIn: { type: "boolean" },
            roles: { type: "array", items: { type: "string" } },
            units: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  unitId: { type: "string", format: "uuid" },
                  unitNumber: { type: "string" },
                  relation: { type: "string", enum: ["owner", "tenant"] },
                  ownershipPct: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/units": {
        get: {
          summary: "Bağımsız bölümleri listele",
          parameters: [
            ...paginationParams,
            { name: "blockId", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Liste",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Unit" } },
                      meta: { $ref: "#/components/schemas/ListMeta" },
                    },
                  },
                },
              },
            },
            default: errorResponse,
          },
        },
        post: {
          summary: "Bağımsız bölüm oluştur",
          responses: { "201": { description: "Oluşturuldu" }, default: errorResponse },
        },
      },
      "/units/{id}": {
        get: {
          summary: "Bağımsız bölüm detayı",
          responses: { "200": { description: "Kayıt" }, default: errorResponse },
        },
        patch: {
          summary: "Bağımsız bölümü güncelle (kısmi)",
          responses: { "200": { description: "Güncellendi" }, default: errorResponse },
        },
        delete: {
          summary: "Bağımsız bölümü sil (soft-delete)",
          description:
            "Kayıt kalıcı olarak silinmez; `deleted_at` işaretlenir ve 30 gün geri alınabilir.",
          responses: { "200": { description: "Silindi" }, default: errorResponse },
        },
      },
      "/debts": {
        get: {
          summary: "Borçları listele",
          parameters: [
            ...paginationParams,
            { name: "unitId", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "period", in: "query", schema: { type: "string", example: "2026-07" } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", description: "`open` tüm ödenmemişleri getirir" },
            },
          ],
          responses: {
            "200": {
              description: "Liste",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Debt" } },
                      meta: { $ref: "#/components/schemas/ListMeta" },
                    },
                  },
                },
              },
            },
            default: errorResponse,
          },
        },
        post: {
          summary: "Borç oluştur",
          responses: { "201": { description: "Oluşturuldu" }, default: errorResponse },
        },
      },
      "/expenses": {
        get: {
          summary: "Giderleri listele",
          parameters: [
            ...paginationParams,
            { name: "categoryId", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "period", in: "query", schema: { type: "string" } },
            { name: "status", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Liste",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Expense" } },
                      meta: { $ref: "#/components/schemas/ListMeta" },
                    },
                  },
                },
              },
            },
            default: errorResponse,
          },
        },
        post: {
          summary: "Gider oluştur",
          description:
            "Dışarıdan gelen kayıt `pending_approval` durumunda açılır; yönetici onayından geçer.",
          responses: { "201": { description: "Oluşturuldu" }, default: errorResponse },
        },
      },
      "/residents": {
        get: {
          summary: "Sakinleri listele (salt okunur)",
          description:
            "Yazma ucu yoktur: sakin kaydı KVKK aydınlatma onayı gerektirir ve panelden, " +
            "insan onayıyla açılır.",
          parameters: [
            ...paginationParams,
            { name: "unitId", in: "query", schema: { type: "string", format: "uuid" } },
          ],
          responses: {
            "200": {
              description: "Liste",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { type: "array", items: { $ref: "#/components/schemas/Resident" } },
                      meta: { $ref: "#/components/schemas/ListMeta" },
                    },
                  },
                },
              },
            },
            default: errorResponse,
          },
        },
      },
    },
};
