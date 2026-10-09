import { BadRequestException, Body, Controller, Injectable, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq, sql } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import {
  bulkNoticeQuery,
  bulkNoticeSend,
  fillNotice,
  relationMatchesScope,
  type BulkNoticePreview,
  type BulkNoticeQuery,
  type BulkNoticeResult,
  type BulkNoticeSend,
  type MemberRelation,
} from "@yonetim/contracts";
import { notifications, tenants } from "@yonetim/db";
import { sendEmail } from "@yonetim/emails";

import { AuditService } from "../governance/audit/audit.service";
import { RequirePermission } from "../identity/decorators";
import { DbService } from "../infra/db/db.service";
import { ZodBodyPipe } from "../infra/zod/zod-dto";
import { memberScopeSql } from "../finance/member-scope";

type Row = Record<string, unknown>;
const UNIT_LABEL = sql`CASE WHEN b.name IS NULL THEN u.number ELSE b.name || ' / ' || u.number END`;
const PERSON = sql.raw(`nullif(trim(concat_ws(' ', us.first_name, us.last_name)), '')`);
const MAX_RECIPIENTS = 2000;

interface Recipient {
  userId: string;
  name: string;
  unitLabel: string;
  email: string | null;
  debtMinor: number;
  tenantName: string | null;
  items: { description: string; dueDate: Date; remaining: number }[];
}

const money = (kurus: number) =>
  `₺${(kurus / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const maskEmail = (e: string) => e.replace(/^(.{0,2}).*(@.*)$/, "$1***$2");

/**
 * Toplu bildirim — alıcıları süzgeçten çıkarır, şablonu kişi başına
 * doldurur, uygulama içi ve e-posta olarak gönderir. Her gönderim
 * `notifications` tablosuna yazılır (gönderim raporu oradan okur).
 *
 * SMS/WhatsApp bu uçta yok: maliyetli entegrasyonlar planlı (yapılacaklar
 * §3); ekranda "entegrasyon bekleniyor" olarak görünür.
 */
@Injectable()
export class BulkNoticeService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async recipients(q: BulkNoticeQuery): Promise<Recipient[]> {
    const block = q.blockId ? sql`AND u.block_id = ${q.blockId}` : sql``;
    if (q.kind === "text" || q.kind === "login") {
      const rows = await this.db.tx(async (tx) =>
        (await tx.execute(sql`
          SELECT o.user_id, ${PERSON} AS name, us.email, ${UNIT_LABEL} AS unit_label, o.relation::text AS relation,
                 o.end_date IS NOT NULL AS ended,
                 EXISTS (SELECT 1 FROM unit_occupancies t WHERE t.unit_id = u.id AND t.relation = 'tenant' AND t.end_date IS NULL) AS has_tenant
          FROM unit_occupancies o JOIN units u ON u.id = o.unit_id LEFT JOIN blocks b ON b.id = u.block_id
          JOIN users us ON us.id = o.user_id
          WHERE u.deleted_at IS NULL AND us.deleted_at IS NULL ${block}
          ORDER BY b.name NULLS FIRST, NULLIF(substring(u.number from '[0-9]+'), '')::numeric NULLS LAST, u.number
        `)) as unknown as Row[],
      );
      // Varsayılan kapsam "aktif": toplu duyuru taşınmış kişiye gitmesin.
      const scope = q.member ?? "active";
      const byUser = new Map<string, { rels: MemberRelation[]; row: Row; units: string[] }>();
      for (const r of rows) {
        const id = String(r.user_id);
        const e = byUser.get(id) ?? { rels: [], row: r, units: [] };
        e.rels.push({ relation: String(r.relation), ended: r.ended === true, unitHasActiveTenant: r.has_tenant === true });
        if (!e.units.includes(String(r.unit_label))) e.units.push(String(r.unit_label));
        byUser.set(id, e);
      }
      return [...byUser.entries()]
        .filter(([, e]) => relationMatchesScope(e.rels, scope))
        .map(([userId, e]) => ({
          userId,
          name: e.row.name ? String(e.row.name) : "—",
          unitLabel: e.units.join(", "),
          email: e.row.email ? String(e.row.email) : null,
          debtMinor: 0,
          tenantName: null,
          items: [],
        }));
    }

    const typeSql = q.debtTypeId ? sql`AND d.debt_type_id = ${q.debtTypeId}` : sql``;
    const periodSql = q.periodUntil
      ? sql`AND COALESCE(d.period, to_char(d.due_date AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM')) <= ${q.periodUntil}`
      : sql``;
    const scopeSql =
      q.kind === "tenant_debt"
        ? sql`(${memberScopeSql("tenant", sql`d.debtor_user_id`, sql`d.unit_id`)} OR ${memberScopeSql("former_tenant", sql`d.debtor_user_id`, sql`d.unit_id`)})`
        : memberScopeSql(q.member, sql`d.debtor_user_id`, sql`d.unit_id`);
    const debts = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT d.unit_id, d.debtor_user_id, ${PERSON} AS debtor_name, us.email, ${UNIT_LABEL} AS unit_label,
               d.description, d.due_date, d.amount_kurus + d.late_fee_kurus - d.paid_kurus AS remaining
        FROM debts d JOIN units u ON u.id = d.unit_id LEFT JOIN blocks b ON b.id = u.block_id
        LEFT JOIN users us ON us.id = d.debtor_user_id
        WHERE d.deleted_at IS NULL AND d.status NOT IN ('paid','written_off','cancelled')
          AND d.amount_kurus + d.late_fee_kurus - d.paid_kurus > 0
          AND d.debtor_user_id IS NOT NULL ${block} ${typeSql} ${periodSql} AND ${scopeSql}
        ORDER BY b.name NULLS FIRST, u.number, d.due_date
      `)) as unknown as Row[],
    );

    if (q.kind === "debt") {
      const byUser = new Map<string, Recipient>();
      for (const d of debts) {
        const id = String(d.debtor_user_id);
        const r = byUser.get(id) ?? {
          userId: id,
          name: d.debtor_name ? String(d.debtor_name) : "—",
          unitLabel: String(d.unit_label),
          email: d.email ? String(d.email) : null,
          debtMinor: 0,
          tenantName: null,
          items: [],
        };
        if (!r.unitLabel.split(", ").includes(String(d.unit_label))) r.unitLabel += `, ${String(d.unit_label)}`;
        r.debtMinor += Number(d.remaining);
        r.items.push({ description: String(d.description), dueDate: new Date(String(d.due_date)), remaining: Number(d.remaining) });
        byUser.set(id, r);
      }
      return [...byUser.values()].filter((r) => q.minTotal === undefined || r.debtMinor >= q.minTotal);
    }

    // Kiracı borcu → bölümün aktif maliklerine.
    const byUnit = new Map<string, { total: number; tenants: Set<string>; label: string; items: Recipient["items"] }>();
    for (const d of debts) {
      const k = String(d.unit_id);
      const e = byUnit.get(k) ?? { total: 0, tenants: new Set<string>(), label: String(d.unit_label), items: [] };
      e.total += Number(d.remaining);
      if (d.debtor_name) e.tenants.add(String(d.debtor_name));
      e.items.push({ description: String(d.description), dueDate: new Date(String(d.due_date)), remaining: Number(d.remaining) });
      byUnit.set(k, e);
    }
    if (byUnit.size === 0) return [];
    const owners = await this.db.tx(async (tx) =>
      (await tx.execute(sql`
        SELECT o.unit_id, o.user_id, ${PERSON} AS name, us.email
        FROM unit_occupancies o JOIN users us ON us.id = o.user_id
        WHERE o.relation = 'owner' AND o.end_date IS NULL
          AND o.unit_id IN (${sql.join([...byUnit.keys()].map((k) => sql`${k}::uuid`), sql`, `)})
      `)) as unknown as Row[],
    );
    return owners
      .map((o) => {
        const e = byUnit.get(String(o.unit_id))!;
        return {
          userId: String(o.user_id),
          name: o.name ? String(o.name) : "—",
          unitLabel: e.label,
          email: o.email ? String(o.email) : null,
          debtMinor: e.total,
          tenantName: [...e.tenants].join(", ") || null,
          items: e.items,
        };
      })
      .filter((r) => q.minTotal === undefined || r.debtMinor >= q.minTotal);
  }

  async preview(q: BulkNoticeQuery): Promise<BulkNoticePreview> {
    const list = await this.recipients(q);
    return {
      recipients: list.slice(0, MAX_RECIPIENTS).map((r) => ({
        userId: r.userId,
        name: r.name,
        unitLabel: r.unitLabel,
        hasEmail: !!r.email,
        emailMasked: r.email ? maskEmail(r.email) : null,
        debtMinor: r.debtMinor,
        tenantName: r.tenantName,
      })),
    };
  }

  async send(dto: BulkNoticeSend): Promise<BulkNoticeResult> {
    const all = await this.recipients(dto);
    const chosen = dto.userIds.length > 0 ? all.filter((r) => dto.userIds.includes(r.userId)) : all;
    if (chosen.length === 0) throw new BadRequestException("validation_failed:no_recipients");
    if (chosen.length > MAX_RECIPIENTS) throw new BadRequestException("validation_failed:too_many_recipients");

    const tenantId = this.db.ctx().tenantId;
    const [site] = await this.db.tx((tx) =>
      tx.select({ name: tenants.name, isDemo: tenants.isDemo }).from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    );
    const siteName = site?.name ?? "";
    const link = `${siteConfig.env.appUrl}/giris`;
    const result: BulkNoticeResult = { recipients: chosen.length, inApp: 0, emailSent: 0, emailSkipped: 0, emailFailed: 0 };
    const template = `bulk_${dto.kind}`;

    for (const r of chosen) {
      const values = { ad: r.name, daire: r.unitLabel, borc: money(r.debtMinor), kiraci: r.tenantName ?? "", site: siteName, link };
      const subject = fillNotice(dto.subject, values).slice(0, 200);
      const body = fillNotice(dto.body, values);

      if (dto.channels.includes("in_app")) {
        await this.db.tx((tx) =>
          tx.insert(notifications).values({
            tenantId, userId: r.userId, channel: "in_app", template, recipient: r.userId,
            subject, body, status: "sent", sentAt: new Date(), resourceType: "bulk_notice",
          }),
        );
        result.inApp += 1;
      }
      if (dto.channels.includes("email")) {
        if (!r.email || site?.isDemo) {
          result.emailSkipped += 1;
          continue;
        }
        const table =
          dto.includeItems && r.items.length > 0
            ? `<table style="border-collapse:collapse;margin-top:12px;font-size:14px">${r.items
                .map(
                  (i) =>
                    `<tr><td style="padding:4px 12px 4px 0">${esc(i.dueDate.toLocaleDateString("tr-TR"))}</td><td style="padding:4px 12px 4px 0">${esc(i.description)}</td><td style="padding:4px 0;text-align:right">${esc(money(i.remaining))}</td></tr>`,
                )
                .join("")}</table>`
            : "";
        const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${esc(body).replace(/\n/g, "<br>")}${table}<p style="color:#6b7280;font-size:12px;margin-top:24px">${esc(siteName)}</p></div>`;
        const sent = await sendEmail({ to: r.email, subject, html, text: body });
        await this.db.tx((tx) =>
          tx.insert(notifications).values({
            tenantId, userId: r.userId, channel: "email", template, recipient: r.email!,
            subject, body, status: sent.ok ? "sent" : "failed", sentAt: sent.ok ? new Date() : null,
            failedAt: sent.ok ? null : new Date(), error: sent.ok ? null : sent.error.message.slice(0, 500),
            provider: "smtp", resourceType: "bulk_notice",
          }),
        );
        if (sent.ok) result.emailSent += 1;
        else result.emailFailed += 1;
      }
    }

    await this.audit.record({
      action: "bulk_notice_sent",
      resource: "notification",
      reason: `${dto.kind}: ${result.recipients} alıcı`,
      diff: { channels: { from: null, to: dto.channels.join(",") }, emailSent: { from: null, to: result.emailSent } },
    });
    return result;
  }
}

/** Toplu bildirim — `/v1/panel/notices/*` (`announcement:write`). */
@ApiTags("panel/notices")
@Controller("v1/panel/notices")
export class BulkNoticeController {
  constructor(private readonly service: BulkNoticeService) {}

  @Post("preview")
  @RequirePermission("announcement:write")
  @ApiOperation({ summary: "Toplu bildirim alıcı önizlemesi" })
  preview(@Body(new ZodBodyPipe(bulkNoticeQuery)) dto: BulkNoticeQuery) {
    return this.service.preview(dto);
  }

  @Post("send")
  @RequirePermission("announcement:write")
  @ApiOperation({ summary: "Toplu bildirim gönder (uygulama içi + e-posta)" })
  send(@Body(new ZodBodyPipe(bulkNoticeSend)) dto: BulkNoticeSend) {
    return this.service.send(dto);
  }
}
