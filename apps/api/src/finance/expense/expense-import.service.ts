import { BadRequestException, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { readTable, type Cell } from "@yonetim/bank";
import type { ExpenseImport, ExpenseImportPreview } from "@yonetim/contracts";
import { expenseCategories, expenses } from "@yonetim/db";

import { AuditService } from "../../governance/audit/audit.service";
import { DbService } from "../../infra/db/db.service";
import { nameKey, parseExpenseFile } from "./expense-file";

type Row = Record<string, unknown>;

/**
 * Giderleri Excel/CSV'den yükle — önizleme ve yazma aynı eşleşmeden.
 * Gider grubu ve firma adla eşleşir (büyük/küçük harf, Türkçe karakter ve
 * boşluk duyarsız); aynı tarih + tutar + açıklama zaten varsa `duplicate`;
 * dönem kilidinin içindeyse `locked`. Yalnız `ok` satırlar yazılır, tek
 * işlemde.
 */
@Injectable()
export class ExpenseImportService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async run(dto: ExpenseImport, commit: boolean): Promise<ExpenseImportPreview> {
    let table: Cell[][];
    try {
      table = readTable(Buffer.from(dto.fileBase64, "base64")).rows;
    } catch {
      throw new BadRequestException("validation_failed:file");
    }
    const parsed = parseExpenseFile(table);
    const ctx = this.db.ctx();
    const result = await this.db.tx(async (tx) => {
      const [cats, vendorRows, lockRow] = await Promise.all([
        tx.execute(sql`SELECT id, name FROM expense_categories WHERE deleted_at IS NULL`),
        tx.execute(sql`SELECT id, name FROM vendors WHERE deleted_at IS NULL`),
        tx.execute(sql`SELECT settings->>'lockedUntil' AS locked FROM tenants WHERE id = ${ctx.tenantId}`),
      ]);
      const catByKey = new Map((cats as unknown as Row[]).map((c) => [nameKey(String(c.name)), String(c.id)]));
      const vendorByKey = new Map((vendorRows as unknown as Row[]).map((v) => [nameKey(String(v.name)), { id: String(v.id), name: String(v.name) }]));
      const lockedUntil = ((lockRow as unknown as Row[])[0]?.locked as string | null) || null;
      const dates = parsed.rows.map((r) => r.date).filter((d): d is string => Boolean(d)).sort();
      const existing = new Set<string>();
      if (dates.length > 0) {
        const rows = (await tx.execute(sql`
          SELECT to_char(expense_date AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM-DD') AS day, amount_kurus, description
          FROM expenses WHERE deleted_at IS NULL
            AND expense_date BETWEEN ${`${dates[0]}T00:00:00+03:00`}::timestamptz AND ${`${dates.at(-1)}T23:59:59+03:00`}::timestamptz
        `)) as unknown as Row[];
        for (const r of rows) existing.add(`${r.day}|${r.amount_kurus}|${nameKey(String(r.description))}`);
      }
      const seen = new Set<string>();
      const newCategories = new Set<string>();
      const rows = parsed.rows.map((r) => {
        const key = `${r.date}|${r.amountMinor}|${nameKey(r.description)}`;
        const categoryMatched = r.category ? catByKey.has(nameKey(r.category)) : false;
        if (r.category && !categoryMatched) newCategories.add(r.category.trim().slice(0, 120));
        const status: ExpenseImportPreview["rows"][number]["status"] = !r.date
          ? "bad_date"
          : r.amountMinor <= 0
            ? "bad_amount"
            : !r.description
              ? "no_description"
              : existing.has(key) || seen.has(key)
                ? "duplicate"
                : lockedUntil && r.date <= lockedUntil
                  ? "locked"
                  : "ok";
        seen.add(key);
        return {
          ...r,
          categoryMatched,
          vendorMatched: r.vendor ? vendorByKey.has(nameKey(r.vendor)) : false,
          paid: r.paid ?? dto.defaultPaid,
          status,
        };
      });

      let created = 0;
      if (commit) {
        if (dto.createCategories) {
          for (const name of newCategories) {
            const [c] = await tx
              .insert(expenseCategories)
              .values({ tenantId: ctx.tenantId, name, distribution: "equal" })
              .returning({ id: expenseCategories.id });
            catByKey.set(nameKey(name), c!.id);
          }
        }
        const values = rows
          .filter((r) => r.status === "ok")
          .map((r) => {
            const vendor = r.vendor ? vendorByKey.get(nameKey(r.vendor)) : undefined;
            const date = new Date(`${r.date}T12:00:00+03:00`);
            return {
              tenantId: ctx.tenantId,
              categoryId: r.category ? catByKey.get(nameKey(r.category)) ?? null : null,
              vendorId: vendor?.id ?? null,
              vendorName: vendor?.name ?? r.vendor,
              description: r.description,
              amountKurus: r.amountMinor,
              vatRate: "0.20",
              vatKurus: Math.round((r.amountMinor * 0.2) / 1.2),
              invoiceNo: r.invoiceNo,
              expenseDate: date,
              paidAt: r.paid ? date : null,
              status: (r.paid ? "paid" : "approved") as "paid" | "approved",
              period: r.date!.slice(0, 7),
              createdBy: ctx.userId,
              approvedBy: ctx.userId,
            };
          });
        if (values.length === 0) throw new BadRequestException("validation_failed:nothing_to_create");
        await tx.insert(expenses).values(values);
        created = values.length;
      }
      return { rows, newCategories: [...newCategories], created };
    });
    if (commit) {
      await this.audit.record({
        action: "expenses_imported",
        resource: "expense",
        diff: { created: { from: null, to: result.created }, newCategories: { from: null, to: dto.createCategories ? result.newCategories : [] } },
      });
    }
    return {
      rows: result.rows,
      newCategories: result.newCategories,
      totalMinor: result.rows.filter((r) => r.status === "ok").reduce((s, r) => s + r.amountMinor, 0),
      missing: parsed.missing,
      created: result.created,
    };
  }
}
