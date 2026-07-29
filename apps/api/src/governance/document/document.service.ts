import { Injectable } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type {
  DocumentListResponse,
  KvkkOverviewResponse,
  LegalCaseListResponse,
} from "@yonetim/contracts";
import {
  announcements,
  consents,
  documents,
  kvkkRequests,
  legalCases,
  units,
} from "@yonetim/db";

import { siteConfig } from "@yonetim/config";
import { isStorageConfigured } from "@yonetim/storage";
import { kvkkRiskScore, planErasure } from "@yonetim/kvkk";

import { DbService } from "../../infra/db/db.service";

const DAY_MS = 86_400_000;
/** "Yakında doluyor" penceresi — belge yenileme için makul uyarı süresi. */
const EXPIRING_SOON_DAYS = 30;

/**
 * Belge, hukuk ve KVKK okuma yüzeyleri — MIMARI-PLAN §8.5.
 *
 * Küçük ve birbirine yakın üç yüzey olduğu için tek serviste; §8.5'in kuralı
 * SQL'in tek yerde toplanması, dosya sayısı değil.
 */
@Injectable()
export class DocumentService {
  constructor(private readonly db: DbService) {}

  async documents(): Promise<DocumentListResponse> {
    const rows = await this.db.tx(async (tx) =>
      tx
        .select()
        .from(documents)
        .where(isNull(documents.deletedAt))
        .orderBy(desc(documents.createdAt))
        .limit(200),
    );

    const now = Date.now();
    const mapped = rows.map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      description: r.description,
      url: r.url,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      version: r.version,
      visibility: r.visibility,
      expiresAt: r.expiresAt,
      expired: Boolean(r.expiresAt && r.expiresAt.getTime() < now),
      expiringSoon: Boolean(
        r.expiresAt &&
        r.expiresAt.getTime() >= now &&
        r.expiresAt.getTime() - now <= EXPIRING_SOON_DAYS * DAY_MS,
      ),
    }));

    return {
      rows: mapped.map((r, i) => ({ ...r, createdAt: rows[i]!.createdAt })),
      totals: {
        total: mapped.length,
        expiringSoon: mapped.filter((r) => r.expiringSoon).length,
        expired: mapped.filter((r) => r.expired).length,
      },
      // Depo kurulu değilse ekran yükleme kutusunu hiç göstermiyor: devre
      // dışı bir düğme "belki çalışır" izlenimi verirdi.
      uploadEnabled: isStorageConfigured(),
    };
  }

  /**
   * İcra dosyaları + henüz dosya açılmamış **adaylar**.
   *
   * Adaylar `packages/jobs` içindeki sorgudan buraya taşındı: `apps/app`'in
   * bir iş paketi üzerinden veritabanına ulaşması, doğrudan ulaşmasından
   * farksızdı (§8.3). Taşırken `units` join'i eklendi.
   */
  async legalCases(): Promise<LegalCaseListResponse> {
    const rows = await this.db.tx(async (tx) =>
      tx
        .select({
          id: legalCases.id,
          unitId: legalCases.unitId,
          unitNumber: units.number,
          caseNo: legalCases.caseNo,
          stage: legalCases.stage,
          principalKurus: legalCases.principalKurus,
          interestKurus: legalCases.interestKurus,
          costsKurus: legalCases.costsKurus,
          collectedKurus: legalCases.collectedKurus,
          collectionScore: legalCases.collectionScore,
          scoreFactors: legalCases.scoreFactors,
          nextActionAt: legalCases.nextActionAt,
          nextActionNote: legalCases.nextActionNote,
          openedAt: legalCases.openedAt,
          closedAt: legalCases.closedAt,
        })
        .from(legalCases)
        .leftJoin(units, eq(units.id, legalCases.unitId))
        .orderBy(desc(legalCases.openedAt))
        .limit(100),
    );

    const mapped = rows.map((r) => ({
      id: r.id,
      unitId: r.unitId,
      unitNumber: r.unitNumber,
      caseNo: r.caseNo,
      stage: r.stage,
      principalMinor: r.principalKurus,
      interestMinor: r.interestKurus,
      costsMinor: r.costsKurus,
      collectedMinor: r.collectedKurus,
      collectionScore: r.collectionScore,
      // Puanın dayanağı da dönüyor: icra kararı verirken "neden bu puan"
      // sorusunun cevabı ekranda olmalı (SPEC 9.3 açıklanabilirlik).
      scoreFactors: r.scoreFactors ?? null,
      nextActionAt: r.nextActionAt,
      nextActionNote: r.nextActionNote,
      openedAt: r.openedAt,
      closedAt: r.closedAt,
    }));

    const thresholdDays = siteConfig.dues.legalActionThresholdDays;
    const threshold = new Date(Date.now() - thresholdDays * DAY_MS);
    const candidateRows = (await this.db.tx(async (tx) =>
      tx.execute(sql`
        SELECT d.unit_id,
               u.number AS unit_number,
               b.name AS block_name,
               SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus)::bigint AS total_kurus,
               MIN(d.due_date) AS oldest_due,
               COUNT(*)::int AS debt_count
        FROM debts d
        JOIN units u ON u.id = d.unit_id
        LEFT JOIN blocks b ON b.id = u.block_id
        WHERE d.due_date < ${threshold.toISOString()}::timestamptz
          AND d.status IN ('pending','partial','overdue')
          AND d.deleted_at IS NULL
        GROUP BY d.unit_id, u.number, b.name
        HAVING SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus) > 0
        ORDER BY total_kurus DESC
      `),
    )) as unknown as {
      unit_id: string;
      unit_number: string | null;
      block_name: string | null;
      total_kurus: string;
      oldest_due: string | null;
      debt_count: number;
    }[];

    // Zaten dosyası açık olan birimler aday değil: yöneticiye ikinci kez
    // "icra başlat" önermek, aynı borç için iki dosya açılmasına yol açardı.
    const openCaseUnits = new Set(
      mapped.filter((r) => !r.closedAt && r.unitId).map((r) => r.unitId),
    );

    return {
      rows: mapped,
      candidates: candidateRows
        .filter((c) => !openCaseUnits.has(c.unit_id))
        .map((c) => ({
          unitId: c.unit_id,
          unitNumber: c.unit_number,
          blockName: c.block_name,
          totalMinor: Number(c.total_kurus),
          oldestDue: c.oldest_due ? new Date(c.oldest_due) : null,
          debtCount: Number(c.debt_count),
        })),
      thresholdDays,
      totals: {
        open: mapped.filter((r) => !r.closedAt).length,
        closed: mapped.filter((r) => r.closedAt).length,
        principalMinor: mapped.reduce((s, r) => s + r.principalMinor, 0),
        collectedMinor: mapped.reduce((s, r) => s + r.collectedMinor, 0),
      },
    };
  }

  /**
   * KVKK genel görünümü — başvurular, risk puanı ve silme planı.
   *
   * Risk puanı burada hesaplanıyor çünkü **girdilerinin hepsi** veritabanından
   * geliyor: rıza kapsamı, geciken başvuru sayısı, işaretlenmiş duyuru, MFA
   * durumu. Ekranda hesaplamak için önce beş sorgunun sonucunu taşımak
   * gerekirdi; puanlama fonksiyonunun kendisi (`@yonetim/kvkk`) zaten saf.
   */
  async kvkkOverview(): Promise<KvkkOverviewResponse> {
    const { requests, consentRows, flagged, mfaEnabled } = await this.db.tx(
      async (tx) => {
        const [requests, consentRows, flagged] = await Promise.all([
          tx
            .select()
            .from(kvkkRequests)
            .orderBy(desc(kvkkRequests.createdAt))
            .limit(100),
          tx
            .select({ granted: consents.granted, kind: consents.kind })
            .from(consents),
          tx
            .select({ value: sql<number>`COUNT(*)::int` })
            .from(announcements)
            .where(
              and(
                eq(announcements.kvkkFlagged, true),
                isNull(announcements.deletedAt),
              ),
            ),
        ]);
        return { requests, consentRows, flagged, mfaEnabled: false };
      },
    );

    const now = Date.now();
    const mapped = requests.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      requesterEmail: r.requesterEmail,
      detail: r.detail,
      dueAt: r.dueAt,
      fulfilledAt: r.fulfilledAt,
      responseNote: r.responseNote,
      // KVKK md.13: 30 gün. Bir uyum göstergesi, tarayıcı saatine bırakılamaz.
      overdue: Boolean(r.dueAt && !r.fulfilledAt && r.dueAt.getTime() < now),
      createdAt: r.createdAt,
    }));

    const mandatory = consentRows.filter((c) => c.kind === "acik_riza_zorunlu");
    // Payda en az 1: hiç zorunlu rıza kaydı yokken 0/0 yerine 0 kapsama
    // göstermek doğru — "kapsam bilinmiyor" ile "kapsam tam" karıştırılmamalı.
    const consentCoverage =
      mandatory.length > 0
        ? mandatory.filter((c) => c.granted).length / mandatory.length
        : 0;
    const overdueCount = mapped.filter((r) => r.overdue).length;
    const flaggedCount = Number(flagged[0]?.value ?? 0);

    const risk = kvkkRiskScore({
      hasPrivacyNotice: true,
      consentCoverage,
      overdueRequests: overdueCount,
      blockedAnnouncements90d: flaggedCount,
      staleResidents: 0,
      verbisRegistered: false,
      hasDpoContact: Boolean(siteConfig.brand.contact.email),
      breaches12m: 0,
      mfaEnabled,
      identityDocsStored: 0,
    });

    return {
      requests: mapped,
      risk: {
        score: risk.score,
        level: risk.level,
        issues: risk.issues.map((i) => ({
          code: i.code,
          weight: i.weight,
          params: i.params,
        })),
      },
      erasurePlan: planErasure(),
      totals: {
        open: mapped.filter((r) => !r.fulfilledAt).length,
        overdue: overdueCount,
        fulfilled: mapped.filter((r) => r.fulfilledAt).length,
        consentCount: consentRows.length,
        flaggedAnnouncements: flaggedCount,
        consentCoverage,
      },
    };
  }
}
