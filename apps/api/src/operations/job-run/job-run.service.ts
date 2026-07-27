import { Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { JobRunRow, JobRunStatus, jobRunList } from "@yonetim/contracts";
import type { z } from "zod";
import { jobRuns } from "@yonetim/db";

import { DbService } from "../../infra/db/db.service";

/**
 * Uzun süren iş koşusu — MIMARI-PLAN §10 B3.
 *
 * Bu servis **iki** süreç tarafından kullanılıyor: `apps/api` koşuyu açıyor ve
 * ilerlemeyi okuyor, `apps/worker` ilerlemeyi yazıyor. Ortak olması bilinçli —
 * iki taraf aynı tabloyu farklı şekillerde güncellerse "processed" alanının ne
 * anlama geldiği ikiye bölünür.
 *
 * İPTAL BİR **BAYRAK**, KUYRUKTAN SİLME DEĞİL. Silinen job yarısını yazmış
 * olabilir ve o hâlde durdurmak veriyi tutarsız bırakır. Bunun yerine durum
 * `cancelling` yapılıyor; iş kendi döngüsünde bunu okuyup **temiz bir noktada**
 * duruyor ve o ana kadar yaptığını kalıcı bırakıyor.
 */
@Injectable()
export class JobRunService {
  constructor(private readonly db: DbService) {}

  async list(kind?: string): Promise<z.infer<typeof jobRunList>> {
    const rows = await this.db.tx(async (tx) =>
      tx
        .select()
        .from(jobRuns)
        .where(kind ? eq(jobRuns.kind, kind) : undefined)
        .orderBy(desc(jobRuns.createdAt))
        .limit(20),
    );
    return { rows: rows.map(toRow) };
  }

  async detail(id: string): Promise<JobRunRow> {
    const row = await this.db.tx(async (tx) => {
      const rows = await tx.select().from(jobRuns).where(eq(jobRuns.id, id)).limit(1);
      return rows[0] ?? null;
    });
    if (!row) throw new NotFoundException("job_run_not_found");
    return toRow(row);
  }

  /** Koşuyu açar. Kuyruğa yazmak çağıranın işi — kayıt önce oluşuyor. */
  async start(params: {
    kind: string;
    total?: number | null;
    input?: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const ctx = this.db.ctx();
    const [row] = await this.db.tx(async (tx) =>
      tx
        .insert(jobRuns)
        .values({
          tenantId: ctx.tenantId,
          kind: params.kind,
          status: "queued",
          startedByUserId: ctx.userId ?? null,
          total: params.total ?? null,
          input: params.input ?? {},
        })
        .returning({ id: jobRuns.id }),
    );
    return { id: row!.id };
  }

  /** Kuyruk kimliğini bağlar — iptal ve izleme bu kimlikten geçiyor. */
  attachQueueJob(id: string, queueJobId: string): Promise<unknown> {
    return this.db.tx(async (tx) =>
      tx.update(jobRuns).set({ queueJobId }).where(eq(jobRuns.id, id)),
    );
  }

  /**
   * İlerleme günceller.
   *
   * `cancelling` durumundaki koşu `running`'e **geri dönmüyor**: iptal isteği
   * bir kez verildiğinde, ilerleme yazan sonraki tick onu silmemeli.
   */
  progress(
    id: string,
    patch: {
      processed?: number;
      total?: number | null;
      step?: string | null;
      succeeded?: number;
      failed?: number;
      errors?: Array<{ row: number; message: string }>;
    },
  ): Promise<unknown> {
    return this.db.tx(async (tx) =>
      tx
        .update(jobRuns)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(jobRuns.id, id), inArray(jobRuns.status, ["running", "cancelling"]))),
    );
  }

  markRunning(id: string): Promise<unknown> {
    return this.db.tx(async (tx) =>
      tx
        .update(jobRuns)
        .set({ status: "running", startedAt: new Date() })
        .where(and(eq(jobRuns.id, id), eq(jobRuns.status, "queued"))),
    );
  }

  finish(
    id: string,
    status: Extract<JobRunStatus, "completed" | "cancelled" | "failed">,
    result?: unknown,
  ): Promise<unknown> {
    return this.db.tx(async (tx) =>
      tx
        .update(jobRuns)
        .set({ status, finishedAt: new Date(), result: result ?? null })
        .where(eq(jobRuns.id, id)),
    );
  }

  /**
   * İptal ister.
   *
   * Yalnız `queued`/`running` koşu iptal edilebiliyor: biten bir işi iptal
   * etmek anlamsız ve `cancelling`'i tekrar yazmak, bekleyen kişiye "isteğin
   * alınmadı" hissi verirdi. Etkilenen satır sayısı dönüyor ki çağıran
   * gerçekten bir şeyin değişip değişmediğini bilsin.
   */
  async cancel(id: string): Promise<{ cancelling: boolean }> {
    const rows = await this.db.tx(async (tx) =>
      tx
        .update(jobRuns)
        .set({ status: "cancelling" })
        .where(and(eq(jobRuns.id, id), inArray(jobRuns.status, ["queued", "running"])))
        .returning({ id: jobRuns.id }),
    );
    return { cancelling: rows.length > 0 };
  }

  /** İş döngüsünün her adımda sorduğu soru: durayım mı? */
  async isCancelRequested(id: string): Promise<boolean> {
    const row = await this.db.tx(async (tx) => {
      const rows = await tx
        .select({ status: jobRuns.status })
        .from(jobRuns)
        .where(eq(jobRuns.id, id))
        .limit(1);
      return rows[0] ?? null;
    });
    return row?.status === "cancelling";
  }
}

type JobRunRecord = typeof jobRuns.$inferSelect;

function toRow(row: JobRunRecord): JobRunRow {
  const errors = Array.isArray(row.errors)
    ? (row.errors as Array<{ row: number; message: string }>)
    : [];
  return {
    id: row.id,
    kind: row.kind,
    status: row.status as JobRunStatus,
    progress: {
      processed: row.processed,
      total: row.total,
      step: row.step,
    },
    succeeded: row.succeeded,
    failed: row.failed,
    // İlk 50 hata: tamamını göstermek ekranı okunmaz hale getirirdi, tamamı
    // yine kayıtta duruyor.
    errors: errors.slice(0, 50),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    createdAt: row.createdAt,
  };
}
