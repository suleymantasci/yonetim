import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import type {
  BankQueueResponse,
  BankStatementImport,
  BankStatementPreview,
  BankStatementPreviewRequest,
  BankStatementResult,
  BankTxActionResult,
  BankTxConfirmBulk,
  BankTxExpense,
} from "@yonetim/contracts";
import { errors } from "@yonetim/core";
import {
  applyMapping,
  display,
  findHeaderRow,
  guessMapping,
  mappingFromProfile,
  matchTransaction,
  profileFromMapping,
  readTable,
  StatementFileError,
  validateMapping,
  type Cell,
  type ColumnMapping,
  type ImportProfile,
  type MatchCandidate,
  type MatchReason,
  type StatementField,
  type Table,
} from "@yonetim/bank";
import { bankAccounts, bankTransactions, blocks, units } from "@yonetim/db";

import { DebtService } from "../finance/debt/debt.service";
import { ExpenseService } from "../finance/expense/expense.service";
import { AuditService } from "../governance/audit/audit.service";
import { DbService } from "../infra/db/db.service";
import { grants } from "../identity/permission";

/**
 * Banka ekstresi içe aktarma ve mutabakat — `bank:reconcile`.
 *
 * NEDEN ÖNERİ, OTOMATİK TAHSİLAT DEĞİL: eşleştirme motoru kural tabanlı ve
 * yanılabilir (aynı isim, daire numarası geçen başka bir açıklama). Yüksek
 * güvenli eşleşme bile **tahsilat kaydı açmıyor**; `suggested` olarak duruyor
 * ve yönetici onaylayınca ödeme yazılıyor. Yanlış dairenin borcunu kapatmak,
 * geri alması (`payment:refund`, dört göz) zor bir hata.
 *
 * DURUMLAR (`bank_transactions.match_status`):
 *   unmatched  öneri çıkmadı, elle daire seçilecek
 *   suggested  motor daire önerdi, onay bekliyor
 *   auto       öneri olduğu gibi onaylandı → tahsilat yazıldı
 *   manual     yönetici başka daire seçti → tahsilat yazıldı
 *   ignored    çıkan hareket ya da yönetici yok saydı
 *
 * ONAY İKİ ADIMLI KİLİTLİ: önce satır durumu `UPDATE ... WHERE durum IN
 * (bekleyen)` ile **sahipleniliyor**, sonra tahsilat yazılıyor. İki sekmeden
 * aynı hareketi onaylamak ikinci tahsilatı üretmiyor; tahsilat başarısızsa
 * durum geri alınıyor.
 */
@Injectable()
export class BankReconcileService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly debts: DebtService,
    private readonly expenses: ExpenseService,
  ) {}

  /**
   * Dökümü oku, başlığı ve sütunları bul (ya da hesabın kayıtlı
   * eşleştirmesini uygula), ilk satırları ve hataları göster. Yazma yok.
   */
  async previewStatement(dto: BankStatementPreviewRequest): Promise<BankStatementPreview> {
    const table = readStatement(dto.fileBase64);
    const profile = await this.accountProfile(dto.accountId);
    const { headerRow, headerFound, mapping, source } = resolveMapping(table, profile, dto.headerRow, dto.mapping);
    const header = table.rows[headerRow] ?? [];
    const problems = validateMapping(mapping);
    const mapped = problems.length > 0 ? { rows: [], errors: [], skipped: 0 } : applyMapping(table.rows, headerRow, mapping);

    const width = Math.min(
      40,
      Math.max(header.length, ...table.rows.slice(headerRow + 1, headerRow + 30).map((r) => r.length), 0),
    );
    const below = table.rows.slice(headerRow + 1);
    // Örnekler satır hizalı (sütun başına ilk dolu değer, boş hücreli satırda
    // alttaki hareketin değerini yanlış satıra koyuyordu).
    const sampleRows = below.filter((r) => r.some((c) => display(c).trim() !== "")).slice(0, 3);
    const columns = Array.from({ length: width }, (_, index) => ({
      index,
      header: display(header[index] ?? null).slice(0, 80),
      field: mapping[index] ?? ("ignore" as const),
      samples: sampleRows.map((r) => display(r[index] ?? null).slice(0, 80)),
    }));
    // Tamamen boş sütunları gösterme (İş Bankası'nda araya boş sütun giriyor).
    const visible = columns.filter((c) => c.header !== "" || c.samples.some((v) => v !== "") || c.field !== "ignore");

    const incoming = mapped.rows.filter((r) => r.direction === "in");
    const outgoing = mapped.rows.filter((r) => r.direction === "out");
    // Önizlemede de öneri gösterilir: yönetici içe aktarmadan önce gönderen,
    // açıklama ve önerilen daireyi birlikte görür. Yazma yok.
    const sample = mapped.rows.slice(0, 50);
    const choices = sample.some((r) => r.direction === "in") ? await this.db.tx((tx) => this.unitChoices(tx)) : [];
    const labelOf = new Map(choices.map((u) => [u.candidate.unitId, u.label]));
    const candidates = choices.map((u) => u.candidate);
    return {
      format: table.format,
      headerRow,
      headerFound,
      mappingSource: source,
      columns: visible,
      problems,
      topRows: table.rows.slice(0, 25).map((r) => r.slice(0, width || 12).map((c) => display(c).slice(0, 60))),
      rows: mapped.rows.slice(0, 50).map((r) => ({
        line: r.line,
        date: r.transactionAt.toISOString().slice(0, 10),
        direction: r.direction,
        amountMinor: r.amountKurus,
        description: r.description ?? null,
        counterparty: r.counterparty ?? null,
        note: r.note || null,
        reference: typeof r.raw.reference === "string" ? r.raw.reference : null,
        suggestedUnitLabel: (() => {
          const unitId = r.direction === "in" ? matchTransaction(r, candidates).unitId : null;
          return unitId ? (labelOf.get(unitId) ?? null) : null;
        })(),
      })),
      errors: mapped.errors.slice(0, 50).map((e) => ({ line: e.line, reason: e.reason, cells: e.cells.slice(0, width || 12) })),
      totals: {
        rows: mapped.rows.length,
        incoming: incoming.length,
        outgoing: outgoing.length,
        incomingMinor: incoming.reduce((sum, r) => sum + r.amountKurus, 0),
        outgoingMinor: outgoing.reduce((sum, r) => sum + r.amountKurus, 0),
        errors: mapped.errors.length,
        skipped: mapped.skipped,
      },
    };
  }

  async importStatement(dto: BankStatementImport): Promise<BankStatementResult> {
    const table = readStatement(dto.fileBase64);
    const mapping = toColumnMapping(dto.mapping);
    const problems = validateMapping(mapping);
    if (problems.length > 0) throw errors.validation(`statement_${problems[0]}`);
    const parsed = applyMapping(table.rows, dto.headerRow, mapping);
    if (parsed.rows.length === 0) {
      throw errors.validation("statement_unreadable", { errors: parsed.errors.slice(0, 20) });
    }

    const result = await this.db.tx(async (tx) => {
      const [account] = await tx
        .select({ id: bankAccounts.id })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, dto.accountId), isNull(bankAccounts.deletedAt)))
        .limit(1);
      if (!account) throw new NotFoundException("bank_account_not_found");

      // Eşleştirme hesaba kaydedilir: aynı bankanın sonraki dökümü doğru gelir.
      await tx
        .update(bankAccounts)
        .set({ importProfile: profileFromMapping(table.rows[dto.headerRow] ?? [], mapping) })
        .where(eq(bankAccounts.id, dto.accountId));

      const candidates = (await this.unitChoices(tx)).map((u) => u.candidate);

      const values = parsed.rows.map(({ line: _line, ...row }) => {
        const match = matchTransaction(row, candidates);
        const outgoing = row.direction === "out";
        return {
          tenantId: this.db.ctx().tenantId,
          accountId: dto.accountId,
          externalId: row.externalId,
          direction: row.direction,
          amountKurus: row.amountKurus,
          balanceAfterKurus: row.balanceAfterKurus ?? null,
          counterparty: row.counterparty ?? null,
          counterpartyIban: row.counterpartyIban ?? null,
          description: row.description ?? null,
          payerNote: row.note || null,
          transactionAt: row.transactionAt,
          provider: row.provider,
          raw: row.raw,
          matchedUnitId: match.unitId,
          matchConfidence: match.unitId ? String(match.confidence) : null,
          matchReasons: match.unitId ? match.reasons : null,
          // Çıkan hareket kuyrukta gider olarak kaydedilmeyi bekler.
          matchStatus: outgoing ? "unmatched" : match.unitId ? "suggested" : "unmatched",
        };
      });

      // Aynı döküm yeniden yüklenirse çoğaltılmaz. Henüz işlenmemiş
      // (eşleşmeyen/önerili) hareket ise yeni okumayla tazelenir: düzeltilen
      // sütun eşleştirmesi ya da sonradan eklenen sakin öneriye yansısın.
      // Tahsil edilmiş/yok sayılmış/gidere dönmüş harekete dokunulmaz.
      const written = await tx
        .insert(bankTransactions)
        .values(values)
        .onConflictDoUpdate({
          target: [bankTransactions.accountId, bankTransactions.externalId],
          set: {
            description: sql`excluded.description`,
            counterparty: sql`excluded.counterparty`,
            counterpartyIban: sql`excluded.counterparty_iban`,
            payerNote: sql`excluded.payer_note`,
            matchReasons: sql`excluded.match_reasons`,
            matchedUnitId: sql`excluded.matched_unit_id`,
            matchConfidence: sql`excluded.match_confidence`,
            matchStatus: sql`excluded.match_status`,
          },
          setWhere: sql`${bankTransactions.matchStatus} IN ('unmatched', 'suggested')`,
        })
        .returning({
          status: bankTransactions.matchStatus,
          direction: bankTransactions.direction,
          // xmax = 0 → yeni satır; değilse çakışmada güncellenen satır.
          fresh: sql<boolean>`(xmax = 0)`,
        });

      const incoming = written.filter((r) => r.direction === "in");
      const inserted = written.filter((r) => r.fresh).length;
      return {
        inserted,
        refreshed: written.length - inserted,
        suggested: incoming.filter((r) => r.status === "suggested").length,
        unmatched: incoming.filter((r) => r.status === "unmatched").length,
        outgoing: written.length - incoming.length,
      };
    });

    await this.audit.record({
      action: "bank_statement_imported",
      resource: "bank_account",
      resourceId: dto.accountId,
      reason: `${result.inserted}/${parsed.rows.length} hareket yazıldı`,
    });

    return {
      parsed: parsed.rows.length,
      ...result,
      duplicates: parsed.rows.length - result.inserted - result.refreshed,
      errors: parsed.errors.slice(0, 50).map(({ line, reason }) => ({ line, reason })),
    };
  }

  async confirm(id: string, unitId?: string): Promise<BankTxActionResult> {
    // Tahsilat kaydı açıyor: `bank:reconcile` tek başına yetmez.
    if (!grants(this.db.maybeCtx(), "payment:create")) {
      throw new ForbiddenException("forbidden:payment:create");
    }

    const claimed = await this.db.tx(async (tx) => {
      const [row] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, id)).limit(1);
      if (!row) throw new NotFoundException("bank_transaction_not_found");
      if (row.direction !== "in") throw errors.validation("not_incoming");

      const targetUnit = unitId ?? row.matchedUnitId;
      if (!targetUnit) throw errors.validation("unit_required");

      const taken = await tx
        .update(bankTransactions)
        .set({
          matchStatus: unitId && unitId !== row.matchedUnitId ? "manual" : "auto",
          matchedUnitId: targetUnit,
        })
        .where(
          and(
            eq(bankTransactions.id, id),
            inArray(bankTransactions.matchStatus, ["unmatched", "suggested"]),
          ),
        )
        .returning({ id: bankTransactions.id });
      if (taken.length === 0) throw new BadRequestException("conflict:already_resolved");

      return { row, unitId: targetUnit };
    });

    try {
      const payment = await this.debts.collect({
        unitId: claimed.unitId,
        amountMinor: claimed.row.amountKurus,
        method: "bank_transfer",
        bankAccountId: claimed.row.accountId,
        paidAt: claimed.row.transactionAt,
        debtIds: [],
        note: `Banka ekstresi: ${[claimed.row.counterparty, claimed.row.description].filter(Boolean).join(" — ")}`.slice(0, 500),
      });

      const status = unitId && unitId !== claimed.row.matchedUnitId ? "manual" : "auto";
      await this.db.tx((tx) =>
        tx
          .update(bankTransactions)
          .set({ matchedPaymentId: payment.paymentId, matchStatus: status })
          .where(eq(bankTransactions.id, id)),
      );
      await this.audit.record({
        action: "bank_transaction_confirmed",
        resource: "bank_transaction",
        resourceId: id,
        reason: `tahsilat ${payment.paymentId}`,
      });
      return { id, status, paymentId: payment.paymentId };
    } catch (error) {
      // Tahsilat yazılamadı: hareket yeniden onaylanabilsin diye eski durumuna.
      await this.db.tx((tx) =>
        tx
          .update(bankTransactions)
          .set({ matchStatus: claimed.row.matchedUnitId ? "suggested" : "unmatched", matchedUnitId: claimed.row.matchedUnitId })
          .where(and(eq(bankTransactions.id, id), isNull(bankTransactions.matchedPaymentId))),
      );
      throw error;
    }
  }

  /**
   * Eşleştirme kuyruğu: sonuçlanmamış gelen (tahsilat) ve çıkan (gider)
   * hareketler, öneriyle. En yeni 300; daha eskisi kuyruk boşaldıkça görünür.
   */
  async queue(): Promise<BankQueueResponse> {
    const rows = await this.db.tx((tx) =>
      tx
        .select({
          id: bankTransactions.id,
          accountId: bankTransactions.accountId,
          bankName: bankAccounts.bankName,
          accountName: bankAccounts.accountName,
          direction: bankTransactions.direction,
          amountKurus: bankTransactions.amountKurus,
          counterparty: bankTransactions.counterparty,
          counterpartyIban: bankTransactions.counterpartyIban,
          description: bankTransactions.description,
          payerNote: bankTransactions.payerNote,
          matchReasons: bankTransactions.matchReasons,
          transactionAt: bankTransactions.transactionAt,
          matchStatus: bankTransactions.matchStatus,
          matchedUnitId: bankTransactions.matchedUnitId,
          matchConfidence: bankTransactions.matchConfidence,
          unitNumber: units.number,
          blockName: blocks.name,
        })
        .from(bankTransactions)
        .leftJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.accountId))
        .leftJoin(units, eq(units.id, bankTransactions.matchedUnitId))
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .where(inArray(bankTransactions.matchStatus, ["unmatched", "suggested"]))
        .orderBy(desc(bankTransactions.transactionAt))
        .limit(300),
    );
    const present = rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      accountLabel: [r.bankName, r.accountName].filter(Boolean).join(" · ") || null,
      direction: r.direction as "in" | "out",
      amountMinor: r.amountKurus,
      counterparty: r.counterparty,
      counterpartyIban: r.counterpartyIban,
      description: r.description,
      note: r.payerNote,
      reasons: (r.matchReasons as MatchReason[] | null) ?? [],
      transactionAt: r.transactionAt,
      matchStatus: r.matchStatus,
      suggestedUnitId: r.matchedUnitId,
      suggestedUnitLabel: r.unitNumber ? (r.blockName ? `${r.blockName} / ${r.unitNumber}` : r.unitNumber) : null,
      confidence: r.matchConfidence === null ? null : Number(r.matchConfidence),
    }));
    const incoming = present.filter((r) => r.direction === "in");
    // Elle eşleştirme için daire listesi sakin adlarıyla: yönetici adı
    // yazarak daireyi bulur (otomatik öneri çıkmasa da).
    const choices = incoming.length > 0 ? await this.db.tx((tx) => this.unitChoices(tx)) : [];
    return {
      incoming,
      outgoing: present.filter((r) => r.direction === "out"),
      units: choices.map((u) => ({ id: u.candidate.unitId, label: u.label, residents: u.candidate.residentNames })),
    };
  }

  /**
   * Toplu tahsilat: her hareket kendi seçilen dairesine, sırayla. Biri
   * başarısız olursa (zaten çözülmüş, daire silinmiş) diğerleri sürer;
   * sonuç satır satır döner.
   */
  async confirmBulk(dto: BankTxConfirmBulk) {
    const results: Array<{ id: string; ok: boolean; paymentId: string | null; error: string | null }> = [];
    for (const item of dto.items) {
      try {
        const r = await this.confirm(item.id, item.unitId);
        results.push({ id: item.id, ok: true, paymentId: r.paymentId, error: null });
      } catch (error) {
        results.push({ id: item.id, ok: false, paymentId: null, error: errorCode(error) });
      }
    }
    return { results };
  }

  /**
   * Çıkan hareketi ödenmiş gider olarak kaydet: tutar, tarih ve ödendiği
   * hesap hareketten; kategori (ve isteğe bağlı tedarikçi) yöneticiden.
   * Onaydaki gibi önce satır sahipleniliyor — iki sekmeden iki gider olmasın.
   */
  async recordExpense(id: string, dto: BankTxExpense): Promise<{ id: string; expenseId: string }> {
    if (!grants(this.db.maybeCtx(), "expense:write")) {
      throw new ForbiddenException("forbidden:expense:write");
    }
    const row = await this.db.tx(async (tx) => {
      const [taken] = await tx
        .update(bankTransactions)
        .set({ matchStatus: "expense" })
        .where(
          and(
            eq(bankTransactions.id, id),
            eq(bankTransactions.direction, "out"),
            inArray(bankTransactions.matchStatus, ["unmatched", "suggested"]),
          ),
        )
        .returning();
      if (!taken) throw new BadRequestException("conflict:already_resolved");
      return taken;
    });

    try {
      const description = (
        dto.description ??
        [row.counterparty, row.description].filter(Boolean).join(" — ") ??
        ""
      ).slice(0, 240);
      const { id: expenseId } = await this.expenses.save({
        categoryId: dto.categoryId,
        vendorId: dto.vendorId ?? null,
        description: description.length >= 3 ? description : "Banka gideri",
        amountMinor: row.amountKurus,
        vatRate: dto.vatRate ?? null,
        withholdingMinor: 0,
        expenseDate: row.transactionAt,
        paidVia: "bank_transfer",
        bankAccountId: row.accountId,
        isPaid: true,
        status: "paid",
      });
      await this.db.tx((tx) =>
        tx.update(bankTransactions).set({ matchedExpenseId: expenseId }).where(eq(bankTransactions.id, id)),
      );
      await this.audit.record({
        action: "bank_transaction_expensed",
        resource: "bank_transaction",
        resourceId: id,
        reason: `gider ${expenseId}`,
      });
      return { id, expenseId };
    } catch (error) {
      await this.db.tx((tx) =>
        tx
          .update(bankTransactions)
          .set({ matchStatus: "unmatched" })
          .where(and(eq(bankTransactions.id, id), isNull(bankTransactions.matchedExpenseId))),
      );
      throw error;
    }
  }

  private async accountProfile(accountId: string): Promise<ImportProfile | null> {
    const [account] = await this.db.tx((tx) =>
      tx
        .select({ id: bankAccounts.id, importProfile: bankAccounts.importProfile })
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, accountId), isNull(bankAccounts.deletedAt)))
        .limit(1),
    );
    if (!account) throw new NotFoundException("bank_account_not_found");
    return (account.importProfile as ImportProfile | null) ?? null;
  }

  async ignore(id: string, reason: string): Promise<BankTxActionResult> {
    const updated = await this.db.tx((tx) =>
      tx
        .update(bankTransactions)
        .set({ matchStatus: "ignored", matchedUnitId: null })
        .where(
          and(
            eq(bankTransactions.id, id),
            inArray(bankTransactions.matchStatus, ["unmatched", "suggested"]),
          ),
        )
        .returning({ id: bankTransactions.id }),
    );
    if (updated.length === 0) throw new BadRequestException("conflict:already_resolved");
    await this.audit.record({
      action: "bank_transaction_ignored",
      resource: "bank_transaction",
      resourceId: id,
      reason,
    });
    return { id, status: "ignored", paymentId: null };
  }

  /**
   * Eşleştirme adayları: açık borcu olan daireler, aktif sakin adları ve
   * daha önce eşleşmiş hareketlerden bilinen IBAN'lar. Tek tur, üç sorgu.
   */
  /**
   * Eşleştirme adayları: daire, açık borç, aktif sakin adları, daha önce bu
   * daireye tahsil edilmiş IBAN'lar ve gönderen adları. `label` blok/daire
   * (kuyruk ve önizleme gösterimi).
   */
  private async unitChoices(
    tx: Parameters<Parameters<DbService["tx"]>[0]>[0],
  ): Promise<Array<{ label: string; candidate: MatchCandidate }>> {
    const rows = (await tx.execute(sql`
      SELECT u.id, u.number, b.name AS block_name,
             COALESCE(SUM(d.amount_kurus + d.late_fee_kurus - d.paid_kurus)
               FILTER (WHERE d.id IS NOT NULL), 0)::bigint AS outstanding
        FROM units u
        LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN debts d ON d.unit_id = u.id AND d.deleted_at IS NULL
                         AND d.status NOT IN ('paid','written_off','cancelled')
       WHERE u.deleted_at IS NULL
       GROUP BY u.id, u.number, b.name
       ORDER BY b.name NULLS FIRST, u.number
    `)) as unknown as Array<{ id: string; number: string; block_name: string | null; outstanding: string | number }>;

    const names = (await tx.execute(sql`
      SELECT o.unit_id, trim(coalesce(us.first_name,'') || ' ' || coalesce(us.last_name,'')) AS name
        FROM unit_occupancies o JOIN users us ON us.id = o.user_id
       WHERE o.end_date IS NULL
    `)) as unknown as Array<{ unit_id: string; name: string }>;

    const known = (await tx.execute(sql`
      SELECT matched_unit_id AS unit_id, counterparty_iban AS iban, counterparty AS sender
        FROM bank_transactions
       WHERE matched_unit_id IS NOT NULL AND match_status IN ('auto','manual')
         AND (counterparty_iban IS NOT NULL OR counterparty IS NOT NULL)
       GROUP BY matched_unit_id, counterparty_iban, counterparty
    `)) as unknown as Array<{ unit_id: string; iban: string | null; sender: string | null }>;

    return rows.map((u) => {
      const own = known.filter((k) => k.unit_id === u.id);
      return {
        label: u.block_name ? `${u.block_name} / ${u.number}` : u.number,
        candidate: {
          unitId: u.id,
          unitLabel: u.number,
          residentNames: [...new Set(names.filter((n) => n.unit_id === u.id && n.name).map((n) => n.name))],
          outstandingKurus: Number(u.outstanding),
          knownIbans: [...new Set(own.map((k) => k.iban).filter((v): v is string => Boolean(v)))],
          knownSenders: [...new Set(own.map((k) => k.sender).filter((v): v is string => Boolean(v)))],
        },
      };
    });
  }

}

/** base64 → tablo; okunamayan dosya kullanıcıya anlamlı hata kodu. */
function readStatement(fileBase64: string): Table {
  try {
    return readTable(Buffer.from(fileBase64, "base64"));
  } catch (error) {
    if (error instanceof StatementFileError) throw errors.validation(`statement_${error.code}`);
    throw error;
  }
}

function toColumnMapping(raw: Record<string, StatementField>): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const [key, field] of Object.entries(raw)) if (field !== "ignore") mapping[Number(key)] = field;
  return mapping;
}

/**
 * Önizlemenin eşleştirmesi: istek > hesabın kayıtlı profili > tahmin.
 * Başlık satırı istekte yoksa bulunur; bulunamazsa 0 (kullanıcı seçer).
 */
function resolveMapping(
  table: Table,
  profile: ImportProfile | null,
  requestedRow: number | undefined,
  requested: Record<string, StatementField> | undefined,
): { headerRow: number; headerFound: boolean; mapping: ColumnMapping; source: "profile" | "guess" | "request" } {
  const found = findHeaderRow(table.rows);
  const headerRow = requestedRow ?? (found >= 0 ? found : 0);
  const headerFound = requestedRow !== undefined || found >= 0;
  const header: Cell[] = table.rows[headerRow] ?? [];
  if (requested) return { headerRow, headerFound, mapping: toColumnMapping(requested), source: "request" };
  const fromProfile = mappingFromProfile(header, profile);
  if (fromProfile) return { headerRow, headerFound, mapping: fromProfile, source: "profile" };
  return { headerRow, headerFound, mapping: guessMapping(header), source: "guess" };
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as Error).message).slice(0, 80);
  return "unknown";
}
