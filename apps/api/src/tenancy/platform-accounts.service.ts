import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import type {
  PlatformAccountDetail,
  PlatformAccountList,
  PlatformAccountRow,
  PlatformManagerList,
} from "@yonetim/contracts";
import { errors, maskPhone } from "@yonetim/core";

import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";

const DAY_MS = 86_400_000;

/**
 * "En kötü" abonelik durumu sıralaması — küçük sayı daha acil.
 *
 * NEDEN ORTALAMA YA DA "İLK SİTE" DEĞİL: on siteli bir yönetim firmasında
 * dokuz site ödemesini yapıyor, biri gecikmişse panel bunu göstermeli. Ortalama
 * durumu gizler, "ilk site" ise tesadüfe bırakır. Operatörün sorduğu soru
 * "bu hesapta ilgilenmem gereken bir şey var mı" ve cevabı en kötü satırda.
 *
 * Sıra ödeme aciliyetine göre: gecikmiş ödeme en önce, arşiv en sonda —
 * arşivlenmiş site zaten bilinçli kapatılmış, müdahale beklemiyor.
 */
const SUBSCRIPTION_SEVERITY = sql`
  CASE s.status
    WHEN 'past_due'  THEN 1
    WHEN 'grace'     THEN 2
    WHEN 'suspended' THEN 3
    WHEN 'trialing'  THEN 4
    WHEN 'active'    THEN 5
    WHEN 'cancelled' THEN 6
    WHEN 'archived'  THEN 7
    ELSE 8
  END
`;

/**
 * Süper-admin hesap yönetimi — SPEC Bölüm 18.1 maddeleri #1–#4.
 *
 * NEDEN "HESAP", KULLANICI YA DA SİTE DEĞİL: panelden beklenen sorular
 * ("kaç hesap kayıtlı", "bu hesaba bağlı kaç site var", "ödemesini yapıyor
 * mu") ne kullanıcı ne tenant satırıyla cevaplanabiliyor. Bir yönetim
 * firmasının on kullanıcısı olabilir ama o **tek** müşteri; aynı firma on
 * siteyi yönetiyor olabilir ama onlar tek bir ticari ilişki. Bu yüzden liste
 * iki kümeyi birleştiriyor: `companies` satırları ve firmaya bağlı **olmayan**
 * siteler.
 *
 * Abonelik site başına kalıyor (2026-07-29 kararı) — burada konsolide bir
 * abonelik değil, konsolide bir **görünüm** var. Hesap satırındaki tutarlar
 * ona bağlı sitelerin toplamı.
 *
 * NEDEN TEK BÜYÜK SORGU: liste on kolonun her biri için ayrı sayım istiyor
 * (site, daire, kullanıcı, fatura, ek paket…). Bunları Drizzle ile ayrı
 * sorgulara bölmek, hesap sayısı büyüdükçe N+1'e dönüşen bir ekran bırakırdı.
 * CTE'ler tenant başına bir kez toplayıp hesap başına bir kez birleştiriyor.
 *
 * TENANT SINIRININ DIŞINDA: `db.bypass` kullanılıyor çünkü sorunun kendisi
 * platform genelinde. Kapı `PlatformController`'da: `assertPlatformAdmin`
 * yetkisiz çağrıyı uçta kesiyor.
 */
@Injectable()
export class PlatformAccountsService {
  private readonly logger = new Logger(PlatformAccountsService.name);

  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------- liste */

  async list(params: {
    query?: string;
    status?: string;
    /** Tek hesabı çekmek için — detay ekranının başlık satırı aynı SQL'den. */
    accountKey?: string;
    limit: number;
    offset: number;
  }): Promise<PlatformAccountList> {
    const like = params.query ? `%${params.query.trim().toLowerCase()}%` : null;

    return this.db.bypass("platform:accounts", async (tx) => {
      const rows = (await tx.execute(sql`
        WITH scoped AS (
          SELECT
            t.id,
            t.company_id,
            t.status,
            t.unit_count,
            t.created_at,
            t.trial_ends_at,
            t.archived_at,
            t.manager_id,
            -- Firmaya bağlı siteler firma anahtarında toplanır; bağımsız site
            -- kendi anahtarını taşır. İki küme tek listede aynı şekilde
            -- gruplanabilsin diye anahtar burada üretiliyor.
            CASE WHEN t.company_id IS NOT NULL
                 THEN 'company:' || t.company_id::text
                 ELSE 'tenant:'  || t.id::text
            END AS account_key
          FROM tenants t
          WHERE t.deleted_at IS NULL
        ),
        subs AS (
          SELECT
            s.tenant_id,
            MIN(${SUBSCRIPTION_SEVERITY}) AS severity,
            SUM(s.price_kurus)            AS price_kurus,
            MIN(s.current_period_end)     AS next_period_end
          FROM subscriptions s
          GROUP BY s.tenant_id
        ),
        inv AS (
          SELECT
            i.tenant_id,
            COALESCE(SUM(i.total_kurus) FILTER (WHERE i.status = 'paid'), 0) AS paid_kurus,
            COALESCE(
              SUM(i.total_kurus) FILTER (WHERE i.status IN ('issued', 'overdue')), 0
            ) AS outstanding_kurus,
            COUNT(*) FILTER (
              -- Vadesi geçmiş ama hâlâ 'issued' duran fatura da gecikmiştir:
              -- durum alanının güncellenmesi bir job'a bağlı ve o job
              -- gecikirse panelin yanlış "sorun yok" demesi kabul edilemez.
              WHERE i.status = 'overdue'
                 OR (i.status = 'issued' AND i.due_at IS NOT NULL AND i.due_at < now())
            )::int AS overdue_count
          FROM invoices i
          GROUP BY i.tenant_id
        ),
        addons AS (
          SELECT a.tenant_id, COUNT(*)::int AS addon_count
          FROM tenant_addons a
          WHERE a.status = 'active'
          GROUP BY a.tenant_id
        ),
        -- Kullanıcı sayısı HESAP DÜZEYİNDE, ayrı bir CTE'de.
        --
        -- NEDEN AŞAĞIDAKİ grouped İÇİNE JOIN EDİLMİYOR: memberships tenant
        -- başına çok satır taşıyor ve o join grouped içindeki bütün SUM
        -- toplamlarını üyelik sayısı kadar çarpıyordu — 24 daireli, 3 üyelikli
        -- bir site 72 daire, yıllık fiyatı da üç katı görünüyordu. Hata gerçek
        -- veriye karşı ilk çağrıda ortaya çıktı. COUNT(DISTINCT) kendini
        -- koruyor ama SUM korumuyor; toplamların yanında satır çoğaltan
        -- hiçbir join durmamalı.
        --
        -- Sayım DISTINCT user_id ve hesap düzeyinde: aynı kişi firmanın beş
        -- sitesinde de üye olabilir, tenant başına sayıp toplamak onu beş
        -- kullanıcı gibi gösterirdi.
        account_users AS (
          SELECT sc.account_key, COUNT(DISTINCT m.user_id)::int AS user_count
          FROM scoped sc
          JOIN memberships m ON m.tenant_id = sc.id AND m.deleted_at IS NULL
          GROUP BY sc.account_key
        ),
        -- Güncel paket: site başına EN SON abonelik (geçmiş satırlar sayılmaz).
        account_plans AS (
          SELECT sc.account_key, array_agg(DISTINCT lp.plan_name ORDER BY lp.plan_name) AS plan_names
          FROM scoped sc
          JOIN LATERAL (
            SELECT p.name AS plan_name
            FROM subscriptions s
            JOIN plans p ON p.id = s.plan_id
            WHERE s.tenant_id = sc.id
            ORDER BY s.created_at DESC
            LIMIT 1
          ) lp ON true
          GROUP BY sc.account_key
        ),
        grouped AS (
          SELECT
            sc.account_key,
            MAX(CASE WHEN sc.company_id IS NOT NULL THEN 1 ELSE 0 END)::int AS is_company,
            MIN(sc.company_id::text)                     AS company_id,
            MIN(sc.id::text)                             AS sample_tenant_id,
            MIN(sc.manager_id::text)                     AS manager_id,
            COUNT(DISTINCT sc.id)::int                   AS site_count,
            COUNT(DISTINCT sc.id) FILTER (WHERE sc.status = 'archived')::int
                                                         AS archived_site_count,
            COALESCE(SUM(sc.unit_count), 0)::int         AS unit_count,
            MIN(sub.severity)                            AS severity,
            COALESCE(SUM(sub.price_kurus), 0)            AS price_kurus,
            MIN(sub.next_period_end)                     AS next_period_end,
            MIN(sc.trial_ends_at)                        AS trial_ends_at,
            COALESCE(SUM(inv.paid_kurus), 0)             AS paid_kurus,
            COALESCE(SUM(inv.outstanding_kurus), 0)      AS outstanding_kurus,
            COALESCE(SUM(inv.overdue_count), 0)::int     AS overdue_count,
            COALESCE(SUM(ad.addon_count), 0)::int        AS addon_count,
            MIN(sc.created_at)                           AS created_at
          FROM scoped sc
          -- Bu üç CTE de tenant başına **tek** satır döndürüyor (kendi
          -- içlerinde GROUP BY var); satır çoğaltmıyorlar.
          LEFT JOIN subs   sub ON sub.tenant_id = sc.id
          LEFT JOIN inv        ON inv.tenant_id = sc.id
          LEFT JOIN addons ad  ON ad.tenant_id  = sc.id
          GROUP BY sc.account_key
        ),
        named AS (
          SELECT
            g.*,
            COALESCE(au.user_count, 0) AS user_count,
            COALESCE(ap.plan_names, ARRAY[]::text[]) AS plan_names,
            -- Ad ve iletişim iki kaynaktan: firma kaydı varsa oradan, yoksa
            -- sitenin kendi adı ve yöneticisinden. Tek kaynağa indirgemek
            -- bağımsız yöneticileri isimsiz bırakırdı.
            COALESCE(c.name, t.name)      AS name,
            COALESCE(c.email, u.email)    AS contact_email,
            COALESCE(c.phone, u.phone)    AS contact_phone,
            NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')
                                          AS contact_name
          FROM grouped g
          LEFT JOIN account_users au ON au.account_key = g.account_key
          LEFT JOIN account_plans ap ON ap.account_key = g.account_key
          LEFT JOIN companies c ON c.id::text = g.company_id AND c.deleted_at IS NULL
          LEFT JOIN tenants   t ON t.id::text = g.sample_tenant_id
          LEFT JOIN users     u ON u.id::text = g.manager_id AND u.deleted_at IS NULL
        )
        SELECT *, COUNT(*) OVER ()::int AS total_count
        FROM named
        WHERE (${params.accountKey ?? null}::text IS NULL
               OR named.account_key = ${params.accountKey ?? null})
          AND (${like}::text IS NULL OR lower(name) LIKE ${like})
          AND (
            ${params.status ?? null}::text IS NULL
            OR ${params.status ?? null}::text = 'all'
            OR EXISTS (
              SELECT 1 FROM scoped s2
              WHERE s2.account_key = named.account_key
                AND s2.status = ${params.status ?? null}
            )
          )
        ORDER BY severity NULLS LAST, outstanding_kurus DESC, created_at DESC
        LIMIT ${params.limit} OFFSET ${params.offset}
      `)) as unknown as AccountQueryRow[];

      const totals = (await tx.execute(sql`
        SELECT
          COUNT(DISTINCT CASE WHEN t.company_id IS NOT NULL
                              THEN 'company:' || t.company_id::text
                              ELSE 'tenant:'  || t.id::text END)::int AS accounts,
          COUNT(*)::int                                    AS sites,
          COALESCE(SUM(t.unit_count), 0)::int              AS units,
          COUNT(DISTINCT CASE WHEN t.status = 'active' THEN t.id END)::int AS paying_sites,
          COUNT(DISTINCT CASE WHEN t.status = 'trial'  THEN t.id END)::int AS trial_sites,
          COALESCE((
            SELECT SUM(i.total_kurus)
            FROM invoices i
            JOIN tenants t2 ON t2.id = i.tenant_id AND t2.deleted_at IS NULL
            WHERE i.status IN ('issued', 'overdue')
          ), 0) AS outstanding_kurus
        FROM tenants t
        WHERE t.deleted_at IS NULL
      `)) as unknown as Array<{
        accounts: number;
        sites: number;
        units: number;
        paying_sites: number;
        trial_sites: number;
        outstanding_kurus: string | number;
      }>;

      const t0 = totals[0];
      return {
        rows: rows.map(toAccountRow),
        total: rows[0]?.total_count ?? 0,
        totals: {
          accounts: t0?.accounts ?? 0,
          sites: t0?.sites ?? 0,
          units: t0?.units ?? 0,
          payingAccounts: t0?.paying_sites ?? 0,
          trialAccounts: t0?.trial_sites ?? 0,
          outstandingMinor: Number(t0?.outstanding_kurus ?? 0),
        },
      };
    });
  }

  /* ------------------------------------------------------- yöneticiler */

  /**
   * Bütün sitelerin yöneticileri — kişi × site satırı.
   *
   * Yönetim rolleri: site yöneticisi ve yönetim firması rolleri. Silinmiş
   * üyelikler ve silinmiş siteler dışarıda. Paket ve dönem sonu sitenin EN SON
   * aboneliğinden; deneme bitişi abonelikte yoksa siteninkinden.
   */
  async managers(params: {
    query?: string;
    limit: number;
    offset: number;
  }): Promise<PlatformManagerList> {
    const like = params.query ? `%${params.query.trim().toLowerCase()}%` : null;
    return this.db.bypass("platform:managers", async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT
          u.id AS user_id,
          NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS name,
          u.email,
          u.phone,
          u.last_login_at,
          m.role::text AS role,
          m.created_at AS member_since,
          t.id AS tenant_id,
          t.name AS tenant_name,
          t.slug AS tenant_slug,
          t.status::text AS tenant_status,
          t.unit_count,
          CASE WHEN t.company_id IS NOT NULL
               THEN 'company:' || t.company_id::text
               ELSE 'tenant:'  || t.id::text END AS account_key,
          ls.plan_name,
          ls.status AS subscription_status,
          COALESCE(ls.trial_ends_at, t.trial_ends_at) AS trial_ends_at,
          ls.current_period_end,
          COUNT(*) OVER ()::int AS total_count
        FROM memberships m
        JOIN users u   ON u.id = m.user_id AND u.deleted_at IS NULL
        JOIN tenants t ON t.id = m.tenant_id AND t.deleted_at IS NULL
        LEFT JOIN LATERAL (
          SELECT p.name AS plan_name, s.status::text AS status, s.trial_ends_at, s.current_period_end
          FROM subscriptions s
          JOIN plans p ON p.id = s.plan_id
          WHERE s.tenant_id = t.id
          ORDER BY s.created_at DESC
          LIMIT 1
        ) ls ON true
        WHERE m.deleted_at IS NULL
          AND m.role IN ('manager', 'company_admin', 'company_operator')
          AND (
            ${like}::text IS NULL
            OR lower(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) LIKE ${like}
            OR lower(COALESCE(u.email, '')) LIKE ${like}
            OR lower(t.name) LIKE ${like}
          )
        ORDER BY COALESCE(ls.current_period_end, ls.trial_ends_at, t.trial_ends_at) ASC NULLS LAST,
                 t.name ASC
        LIMIT ${params.limit} OFFSET ${params.offset}
      `)) as unknown as ManagerQueryRow[];

      return {
        total: rows[0]?.total_count ?? 0,
        rows: rows.map((row) => ({
          userId: row.user_id,
          name: row.name ?? row.email ?? "—",
          email: row.email,
          phone: row.phone ? maskPhone(row.phone) : null,
          role: row.role,
          lastLoginAt: toDate(row.last_login_at),
          tenantId: row.tenant_id,
          tenantName: row.tenant_name,
          tenantSlug: row.tenant_slug,
          tenantStatus: row.tenant_status,
          accountKey: row.account_key,
          unitCount: row.unit_count,
          planName: row.plan_name,
          subscriptionStatus: row.subscription_status,
          trialEndsAt: toDate(row.trial_ends_at),
          periodEndAt: toDate(row.current_period_end),
          memberSince: toDate(row.member_since)!,
        })),
      };
    });
  }

  /* ------------------------------------------------------------ detay */

  async detail(accountKey: string): Promise<PlatformAccountDetail> {
    const { kind, id } = parseAccountKey(accountKey);

    return this.db.bypass("platform:account-detail", async (tx) => {
      /*
       * Hesabın siteleri: firma anahtarında `company_id` eşleşmesi, bağımsız
       * hesapta tek tenant. İki dal aynı `tenantIds` listesine indirgeniyor ki
       * aşağıdaki sorgular kaynağı bilmek zorunda kalmasın.
       */
      const scope =
        kind === "company"
          ? sql`t.company_id = ${id}`
          : sql`t.id = ${id} AND t.company_id IS NULL`;

      const sites = (await tx.execute(sql`
        SELECT
          t.id, t.name, t.slug, t.status, t.unit_count, t.created_at,
          t.trial_ends_at, t.archived_at, t.purge_after_at,
          (
            SELECT COUNT(*)::int FROM memberships m
            WHERE m.tenant_id = t.id AND m.deleted_at IS NULL
              AND m.role IN ('owner', 'tenant_resident')
          ) AS resident_count,
          s.id AS sub_id, s.status AS sub_status, s.billing_period,
          s.price_kurus, s.current_period_end, s.trial_ends_at AS sub_trial_ends_at,
          s.cancel_at_period_end, s.dunning_step, s.sms_used_this_period,
          p.name AS plan_name, p.sms_quota_yearly
        FROM tenants t
        LEFT JOIN subscriptions s ON s.tenant_id = t.id
        LEFT JOIN plans p ON p.id = s.plan_id
        WHERE ${scope} AND t.deleted_at IS NULL
        ORDER BY t.created_at
      `)) as unknown as SiteQueryRow[];

      if (sites.length === 0) throw new NotFoundException("account_not_found");
      const tenantIds = sites.map((row) => row.id);

      const users = (await tx.execute(sql`
        SELECT
          u.id, u.first_name, u.last_name, u.email, u.phone, u.last_login_at,
          u.platform_role, u.deleted_at, u.anonymized_at,
          ARRAY_AGG(DISTINCT m.role::text) AS roles,
          COUNT(DISTINCT m.tenant_id)::int AS site_count
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE m.tenant_id IN ${uuidList(tenantIds)}
          AND m.deleted_at IS NULL
          -- Sakinler listeye girmiyor: bu ekran **müşteri hesabını** anlatıyor,
          -- site nüfusunu değil. Bin daireli bir sitede sakinleri de listelemek
          -- ekranı kullanılamaz hâle getirir ve KVKK açısından gereksiz bir
          -- kişisel veri yığınını platform paneline taşırdı.
          AND m.role NOT IN ('owner', 'tenant_resident')
        GROUP BY u.id
        ORDER BY u.created_at
        LIMIT 100
      `)) as unknown as UserQueryRow[];

      const invoices = (await tx.execute(sql`
        SELECT i.id, i.invoice_no, i.status, i.total_kurus,
               i.issued_at, i.due_at, i.paid_at, t.name AS tenant_name
        FROM invoices i
        JOIN tenants t ON t.id = i.tenant_id
        WHERE i.tenant_id IN ${uuidList(tenantIds)}
        ORDER BY i.created_at DESC
        LIMIT 50
      `)) as unknown as InvoiceQueryRow[];

      const addons = (await tx.execute(sql`
        SELECT a.id, a.kind, a.name, a.purchased_quantity, a.remaining_quantity,
               a.total_price_kurus, a.source, a.status, a.valid_until,
               t.name AS tenant_name
        FROM tenant_addons a
        JOIN tenants t ON t.id = a.tenant_id
        WHERE a.tenant_id IN ${uuidList(tenantIds)}
        ORDER BY a.created_at DESC
        LIMIT 50
      `)) as unknown as AddonQueryRow[];

      /*
       * Başlık satırı liste SQL'inden geliyor, elle yeniden toplanmıyor: iki
       * yerde iki hesap mantığı zamanla ayrışır ve ayrışan taraf sessizce
       * yanlış rakam gösterir. `accountKey` filtresi aynı sorguyu tek hesaba
       * indiriyor.
       */
      const header = (
        await this.list({ accountKey, limit: 1, offset: 0 })
      ).rows[0];
      if (!header) throw new NotFoundException("account_not_found");

      return {
        account: header,
        sites: sites.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          status: row.status,
          unitCount: row.unit_count,
          residentCount: row.resident_count,
          trialEndsAt: toDate(row.trial_ends_at),
          archivedAt: toDate(row.archived_at),
          purgeAfterAt: toDate(row.purge_after_at),
          daysLeftToRecover: daysLeft(row.purge_after_at),
          subscription: row.sub_id
            ? {
                id: row.sub_id,
                planName: row.plan_name ?? "—",
                status: row.sub_status ?? "unknown",
                billingPeriod: row.billing_period ?? siteConfig.billing.defaultPeriod,
                priceMinor: Number(row.price_kurus ?? 0),
                currentPeriodEndAt: toDate(row.current_period_end),
                trialEndsAt: toDate(row.sub_trial_ends_at),
                cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
                dunningStep: row.dunning_step ?? 0,
                smsUsedThisPeriod: row.sms_used_this_period ?? 0,
                smsQuotaYearly: row.sms_quota_yearly ?? 0,
              }
            : null,
          createdAt: toDate(row.created_at)!,
        })),
        users: users.map((row) => ({
          id: row.id,
          name:
            [row.first_name, row.last_name].filter(Boolean).join(" ") ||
            row.email ||
            "—",
          email: row.email,
          // §9.1: platform paneli de açık numara taşımıyor. Destek ekibinin
          // numarayı **görmesi** gerekmiyor; hangi numara olduğunu doğrulaması
          // yeterli ve maskeli hâl bunu karşılıyor.
          phone: row.phone ? maskPhone(row.phone) : null,
          roles: row.roles?.filter(Boolean) ?? [],
          siteCount: row.site_count,
          lastLoginAt: toDate(row.last_login_at),
          isPlatformUser: Boolean(row.platform_role),
          status: row.deleted_at
            ? "deleted"
            : row.anonymized_at
              ? "anonymized"
              : "active",
        })),
        invoices: invoices.map((row) => ({
          id: row.id,
          invoiceNo: row.invoice_no,
          tenantName: row.tenant_name,
          status: row.status,
          totalMinor: Number(row.total_kurus),
          issuedAt: toDate(row.issued_at),
          dueAt: toDate(row.due_at),
          paidAt: toDate(row.paid_at),
        })),
        addons: addons.map((row) => ({
          id: row.id,
          tenantName: row.tenant_name,
          kind: row.kind,
          name: row.name,
          purchasedQuantity: row.purchased_quantity,
          remainingQuantity: row.remaining_quantity,
          totalPriceMinor: Number(row.total_price_kurus),
          source: row.source,
          status: row.status,
          validUntil: toDate(row.valid_until),
        })),
      };
    });
  }

  /* -------------------------------------------------------- aksiyonlar */

  /**
   * Abonelik süresi uzatma — destek jesti ya da ticari anlaşma.
   *
   * Deneme mi ücretli dönem mi olduğuna göre **farklı alan** ileriye alınıyor:
   * denemedeki hesabın `trial_ends_at`'ı, ücretli hesabın
   * `current_period_end`'i. Tek alanı uzatmak, denemedeki hesaba ücretli dönem
   * tanımlamak (ya da tersi) olurdu.
   *
   * Uzatma `past_due`/`suspended` hesabı da **geri açıyor**: süre vermenin
   * amacı erişimi geri vermek. Sadece tarihi ileri alıp durumu `past_due`
   * bırakmak, dunning job'ının bir sonraki turda erişimi yine kesmesi
   * demekti — destek ekibi aynı çağrıyı her gün tekrarlardı.
   */
  async extend(params: {
    tenantId: string;
    days: number;
    reason: string;
  }): Promise<{ ok: true; affected: number }> {
    const affected = await this.db.bypass("platform:extend", async (tx) => {
      const rows = (await tx.execute(sql`
        SELECT t.status, s.id AS sub_id, s.status AS sub_status
        FROM tenants t
        LEFT JOIN subscriptions s ON s.tenant_id = t.id
        WHERE t.id = ${params.tenantId} AND t.deleted_at IS NULL
        LIMIT 1
      `)) as unknown as Array<{
        status: string;
        sub_id: string | null;
        sub_status: string | null;
      }>;
      const row = rows[0];
      if (!row) throw new NotFoundException("tenant_not_found");
      if (row.status === "archived" || row.status === "cancelled") {
        // Arşivdeki siteye süre vermek anlamsız: site salt-okunur, kullanıcı
        // uzatılan süreyi kullanamaz. Önce geri açılması gerekiyor.
        throw errors.validation("restore_before_extend");
      }

      // M-45: `sql.raw` ile kullanıcı girdisi SQL'e sokulmuyor; Drizzle
      // parameter binding yerine integer + Drizzle `sql` template ile
      // `INTERVAL '1 day' * $1` deseni kullanılır. `params.days` Zod ile
      // 1..730 aralığında doğrulanıyor, ama saldırı yüzeyini azaltıyoruz.
      const interval = sql`make_interval(days => ${params.days})`;
      const onTrial = row.status === "trial";

      await tx.execute(sql`
        UPDATE tenants SET
          trial_ends_at = CASE WHEN ${onTrial}
            THEN GREATEST(COALESCE(trial_ends_at, now()), now()) + ${interval}
            ELSE trial_ends_at END,
          current_period_end = CASE WHEN ${onTrial}
            THEN current_period_end
            ELSE GREATEST(COALESCE(current_period_end, now()), now()) + ${interval} END,
          status = CASE WHEN status IN ('past_due', 'suspended')
            THEN 'active'::tenant_status ELSE status END,
          suspension_reason = CASE WHEN status IN ('past_due', 'suspended')
            THEN NULL ELSE suspension_reason END,
          updated_at = now()
        WHERE id = ${params.tenantId}
      `);

      if (row.sub_id) {
        await tx.execute(sql`
          UPDATE subscriptions SET
            trial_ends_at = CASE WHEN ${onTrial}
              THEN GREATEST(COALESCE(trial_ends_at, now()), now()) + ${interval}
              ELSE trial_ends_at END,
            current_period_end = CASE WHEN ${onTrial}
              THEN current_period_end
              ELSE GREATEST(COALESCE(current_period_end, now()), now()) + ${interval} END,
            status = CASE WHEN status IN ('past_due', 'grace', 'suspended')
              THEN (CASE WHEN ${onTrial} THEN 'trialing' ELSE 'active' END)::subscription_status
              ELSE status END,
            -- Dunning sayacı sıfırlanıyor: süre verildiyse hatırlatma zinciri
            -- baştan başlamalı, kaldığı yerden değil.
            dunning_step = 0,
            dunning_started_at = NULL,
            updated_at = now()
          WHERE id = ${row.sub_id}
        `);
      }
      return 1;
    });

    await this.audit.record({
      action: "subscription_extended",
      resource: "tenant",
      resourceId: params.tenantId,
      reason: params.reason,
      diff: { extendedDays: { from: 0, to: params.days } },
    });
    this.logger.log({
      event: "platform.subscription_extended",
      tenantId: params.tenantId,
      days: params.days,
    });
    return { ok: true, affected };
  }

  /**
   * Hesap seviyesinde dondur / aktifleştir / kapat.
   *
   * Kapsam hesabın **tüm** siteleri: bir yönetim firmasının ödemesi durduysa
   * tek sitesini değil ilişkinin tamamını dondurmak gerekiyor. Site tek tek
   * yönetilecekse yaşam döngüsü uçları var.
   *
   * `freeze` `suspended` yazıyor, `archived` değil: askı **platformun** ödeme
   * kaynaklı kararı ve geri alınması ödeme gelmesine bağlı; arşiv ise
   * müşterinin "işim bitti" kararı ve 90 günlük kurtarma penceresi taşıyor.
   * İkisini aynı duruma indirgemek, panelin "bu site neden kapalı" sorusunu
   * cevaplayamaması demekti.
   */
  async accountAction(params: {
    accountKey: string;
    action: "freeze" | "activate" | "close";
    reason: string;
  }): Promise<{ ok: true; affected: number }> {
    const { kind, id } = parseAccountKey(params.accountKey);
    const scope =
      kind === "company"
        ? sql`company_id = ${id}`
        : sql`id = ${id} AND company_id IS NULL`;

    const affected = await this.db.bypass("platform:account-action", async (tx) => {
      /*
       * ZAMAN DAMGALARI SQL'DEN, JS'TEN DEĞİL.
       *
       * `sql` şablonuna bir JS `Date` gömmek postgres.js sürücüsünde
       * "The string argument must be of type string… Received an instance of
       * Date" ile düşüyor — PROJE-DURUMU §5.9.1'de aynı hata bir kez
       * yaşanmış ve burada tekrarlandı, gerçek çağrıda 500 olarak çıktı.
       *
       * `now()` kullanmak ayrıca daha doğru: tek transaction içindeki bütün
       * satırlar **aynı** zaman damgasını alıyor (Postgres `now()` transaction
       * başlangıcını döner) ve zamanın otoritesi uygulama sunucusunun saati
       * değil veritabanı oluyor.
       */
      if (params.action === "freeze") {
        const rows = (await tx.execute(sql`
          UPDATE tenants SET
            status = 'suspended', suspension_reason = ${params.reason}, updated_at = now()
          WHERE ${scope} AND deleted_at IS NULL AND status NOT IN ('archived', 'cancelled')
          RETURNING id
        `)) as unknown as Array<{ id: string }>;

        await tx.execute(sql`
          UPDATE subscriptions SET status = 'suspended', updated_at = now()
          WHERE tenant_id IN ${uuidList(rows.map((r) => r.id))}
        `);
        return rows.length;
      }

      if (params.action === "activate") {
        const rows = (await tx.execute(sql`
          UPDATE tenants SET
            status = CASE
              -- Denemesi bitmemiş hesap denemeye döner, bitmişse aktife:
              -- süresi dolmamış bir denemeyi ücretli saymak, ödemesi
              -- alınmamış hesabı faturalanabilir göstermek olurdu.
              WHEN trial_ends_at IS NOT NULL AND trial_ends_at > now() THEN 'trial'::tenant_status
              ELSE 'active'::tenant_status
            END,
            suspension_reason = NULL,
            updated_at = now()
          WHERE ${scope} AND deleted_at IS NULL AND status IN ('suspended', 'past_due')
          RETURNING id, status
        `)) as unknown as Array<{ id: string; status: string }>;

        for (const row of rows) {
          await tx.execute(sql`
            UPDATE subscriptions SET
              status = ${row.status === "trial" ? "trialing" : "active"}::subscription_status,
              dunning_step = 0, dunning_started_at = NULL, updated_at = now()
            WHERE tenant_id = ${row.id}
          `);
        }
        return rows.length;
      }

      // close: ilişkiyi bitir. Siteler arşive gidiyor — kalıcı silme ayrı ve
      // site bazında, çünkü geri dönüşü yok.
      //
      // Kurtarma penceresi de SQL'de hesaplanıyor: `interval` metni config'ten
      // gelen sayıyla kuruluyor (`sql.raw` yalnız sayı taşıyor, kullanıcı
      // girdisi değil), tarih aritmetiği veritabanının saatine göre yapılıyor.
      const recoveryInterval = sql.raw(
        `interval '${siteConfig.billing.archiveRecoveryDays} days'`,
      );
      const rows = (await tx.execute(sql`
        UPDATE tenants SET
          status_before_archive = status,
          status = 'archived',
          archived_at = now(),
          archived_by = ${this.db.ctx().userId ?? null},
          purge_after_at = now() + ${recoveryInterval},
          suspension_reason = ${params.reason},
          cancelled_at = now(),
          updated_at = now()
        WHERE ${scope} AND deleted_at IS NULL AND status <> 'archived'
        RETURNING id
      `)) as unknown as Array<{ id: string }>;

      await tx.execute(sql`
        UPDATE subscriptions SET status = 'archived', cancelled_at = now(), updated_at = now()
        WHERE tenant_id IN ${uuidList(rows.map((r) => r.id))}
      `);
      return rows.length;
    });

    await this.audit.record({
      action: `account_${params.action}`,
      resource: "tenant",
      resourceId: id,
      reason: params.reason,
      diff: { affectedSites: { from: null, to: affected } },
    });
    this.logger.warn({
      event: "platform.account_action",
      accountKey: params.accountKey,
      action: params.action,
      affected,
    });
    return { ok: true, affected };
  }

  /**
   * Ek paket tanımlama — satış, kampanya ödülü veya destek jesti.
   *
   * Bedelsiz tanımlanabiliyor (`totalPriceMinor: 0`) ve o durumda `source`
   * `manual_grant` oluyor: "kim bedava kredi verdi" sorusu faturalanan
   * satıştan ayrı izlenebilmeli, yoksa gelir raporunda hediye krediler satış
   * gibi görünürdü.
   */
  async grantAddon(params: {
    tenantId: string;
    kind: "sms" | "whatsapp";
    quantity: number;
    totalPriceMinor: number;
    validUntil: Date | null;
    reason: string;
  }): Promise<{ ok: true; affected: number }> {
    const unitPriceTl = siteConfig.billing.addonUnitPrice[params.kind];

    await this.db.bypass("platform:grant-addon", async (tx) => {
      const exists = (await tx.execute(sql`
        SELECT id FROM tenants WHERE id = ${params.tenantId} AND deleted_at IS NULL LIMIT 1
      `)) as unknown as Array<{ id: string }>;
      if (exists.length === 0) throw new NotFoundException("tenant_not_found");

      await tx.execute(sql`
        INSERT INTO tenant_addons (
          tenant_id, kind, name, purchased_quantity, remaining_quantity,
          unit_price_kurus, total_price_kurus, source, valid_until, granted_by, note
        ) VALUES (
          ${params.tenantId},
          ${params.kind},
          ${`${params.quantity} ${params.kind === "sms" ? "SMS" : "WhatsApp"} paketi`},
          ${params.quantity},
          ${params.quantity},
          ${Math.round(unitPriceTl * 100)},
          ${params.totalPriceMinor},
          ${params.totalPriceMinor > 0 ? "purchase" : "manual_grant"},
          ${params.validUntil ? params.validUntil.toISOString() : null},
          ${this.db.ctx().userId ?? null},
          ${params.reason}
        )
      `);
    });

    await this.audit.record({
      action: "addon_granted",
      resource: "tenant",
      resourceId: params.tenantId,
      reason: params.reason,
      diff: {
        addonKind: { from: null, to: params.kind },
        quantity: { from: 0, to: params.quantity },
      },
    });
    return { ok: true, affected: 1 };
  }
}

/* ------------------------------------------------------------ yardımcı */

/**
 * UUID listesini `IN (...)` parçasına çevirir.
 *
 * NEDEN `= ANY(${ids}::uuid[])` DEĞİL: Drizzle'ın `sql` şablonu bir dizi
 * gördüğünde onu **virgülle ayrılmış parametre listesine** açıyor
 * (`$1, $2, $3`), tek bir dizi parametresine değil. Sonuç `ANY($1, $2)::uuid[]`
 * gibi geçersiz bir ifade oluyor ve Postgres "malformed array literal" ile
 * düşüyor — bu hata tam olarak böyle, ilk gerçek çağrıda ortaya çıktı.
 *
 * Boş listede `IN (NULL)`: hiçbir satır eşleşmiyor. Parçayı hiç üretmemek
 * (yani `WHERE` koşulunu düşürmek) **bütün** satırları döndürürdü — boş bir
 * hesabın sorgusu tüm platformun faturalarını getirirdi.
 */
function uuidList(ids: string[]) {
  if (ids.length === 0) return sql`(NULL)`;
  return sql`(${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}

/**
 * `company:<uuid>` / `tenant:<uuid>` ayrıştırma.
 *
 * Anahtar iki kümeyi tek listede taşıyor; ayrıştırma tek yerde olsun ki
 * aksiyonların hangi kapsamda çalıştığı sorusu her uçta yeniden
 * cevaplanmasın. Bilinmeyen önek reddediliyor — tahmin etmek, yanlış kapsamda
 * çalışan bir "kapat" aksiyonuna dönüşebilirdi.
 */
function parseAccountKey(key: string): { kind: "company" | "standalone"; id: string } {
  const [prefix, id] = key.split(":");
  if (!id) throw errors.validation("invalid_account_key");
  if (prefix === "company") return { kind: "company", id };
  if (prefix === "tenant") return { kind: "standalone", id };
  throw errors.validation("invalid_account_key");
}

/**
 * Ham SQL'den gelen zaman damgası.
 *
 * `tx.execute(sql`…`)` sonuçlarını Drizzle'ın tip sistemi **bilmiyor**: satırlar
 * `as unknown as ...` ile elle tiplenmiş ve o tipler yalnızca bir iddia. Bu
 * yolda zaman damgaları `Date` **değil**, Postgres'in metin biçiminde
 * (`2026-08-28 21:13:23.695+03`) geliyor.
 *
 * Alanları `Date` diye tiplemek bu yüzden bir yalandı ve hata tam oradan
 * sızdı: sözleşme tarafı `z.coerce.date()` ile metni sessizce düzelttiği için
 * her şey çalışıyor görünüyordu, ama üzerinde **aritmetik** yapan tek yer
 * (`daysLeft`) çalışma zamanında `getTime is not a function` ile düşüyordu.
 * Hata yalnız arşivlenmiş sitede görünüyordu: `purge_after_at` boşken
 * fonksiyon erken dönüyor, ilk kez arşivde dolduğunda patlıyor.
 *
 * Tip artık gerçeği söylüyor ve dönüşüm `toDate()` ile sınırda yapılıyor.
 */
type RawTimestamp = Date | string | null;

/** Ham zaman damgasını `Date`'e çevirir; geçersiz metinde null. */
function toDate(value: RawTimestamp): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysLeft(purgeAfterAt: RawTimestamp): number | null {
  const date = toDate(purgeAfterAt);
  if (!date) return null;
  const ms = date.getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

/** Sıralama sayısını okunur duruma çevirir — ekran ham rakamı görmesin. */
const SEVERITY_TO_STATUS: Record<number, string> = {
  1: "past_due",
  2: "grace",
  3: "suspended",
  4: "trialing",
  5: "active",
  6: "cancelled",
  7: "archived",
};

function toAccountRow(row: AccountQueryRow): PlatformAccountRow {
  return {
    key: row.account_key,
    kind: row.is_company === 1 ? "company" : "standalone",
    name: row.name ?? "—",
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone ? maskPhone(row.contact_phone) : null,
    siteCount: row.site_count,
    archivedSiteCount: row.archived_site_count,
    unitCount: row.unit_count,
    userCount: row.user_count,
    worstSubscriptionStatus:
      row.severity === null ? null : (SEVERITY_TO_STATUS[row.severity] ?? null),
    nextPeriodEndAt: toDate(row.next_period_end),
    trialEndsAt: toDate(row.trial_ends_at),
    yearlyPriceMinor: Number(row.price_kurus ?? 0),
    paidTotalMinor: Number(row.paid_kurus ?? 0),
    outstandingMinor: Number(row.outstanding_kurus ?? 0),
    overdueInvoiceCount: row.overdue_count,
    addonCount: row.addon_count,
    planNames: row.plan_names ?? [],
    // `created_at` şemada NOT NULL; dönüşüm yine de tek yerden geçiyor.
    createdAt: toDate(row.created_at)!,
  };
}

interface ManagerQueryRow {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  last_login_at: RawTimestamp;
  role: string;
  member_since: RawTimestamp;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
  unit_count: number;
  account_key: string;
  plan_name: string | null;
  subscription_status: string | null;
  trial_ends_at: RawTimestamp;
  current_period_end: RawTimestamp;
  total_count: number;
}

interface AccountQueryRow {
  account_key: string;
  is_company: number;
  name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  site_count: number;
  archived_site_count: number;
  unit_count: number;
  user_count: number;
  severity: number | null;
  next_period_end: RawTimestamp;
  trial_ends_at: RawTimestamp;
  price_kurus: string | number | null;
  paid_kurus: string | number | null;
  outstanding_kurus: string | number | null;
  overdue_count: number;
  addon_count: number;
  plan_names: string[] | null;
  created_at: RawTimestamp;
  total_count: number;
}

interface SiteQueryRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  unit_count: number;
  resident_count: number;
  created_at: RawTimestamp;
  trial_ends_at: RawTimestamp;
  archived_at: RawTimestamp;
  purge_after_at: RawTimestamp;
  sub_id: string | null;
  sub_status: string | null;
  billing_period: string | null;
  price_kurus: string | number | null;
  current_period_end: RawTimestamp;
  sub_trial_ends_at: RawTimestamp;
  cancel_at_period_end: boolean | null;
  dunning_step: number | null;
  sms_used_this_period: number | null;
  plan_name: string | null;
  sms_quota_yearly: number | null;
}

interface UserQueryRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  last_login_at: RawTimestamp;
  platform_role: string | null;
  deleted_at: RawTimestamp;
  anonymized_at: RawTimestamp;
  roles: string[] | null;
  site_count: number;
}

interface InvoiceQueryRow {
  id: string;
  invoice_no: string;
  status: string;
  total_kurus: string | number;
  issued_at: RawTimestamp;
  due_at: RawTimestamp;
  paid_at: RawTimestamp;
  tenant_name: string;
}

interface AddonQueryRow {
  id: string;
  kind: string;
  name: string;
  purchased_quantity: number;
  remaining_quantity: number;
  total_price_kurus: string | number;
  source: string;
  status: string;
  valid_until: RawTimestamp;
  tenant_name: string;
}
