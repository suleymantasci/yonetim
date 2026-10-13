import { createHmac } from "node:crypto";

import { HttpException, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, gte, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import type { Request } from "express";

import { hasPermission, rateLimit } from "@yonetim/auth";
import { isPlatformContext, isResidentRole, type Role } from "@yonetim/core";
import { agendaItems, blocks, debts, expenses, payments, requests, unitOccupancies, units, users } from "@yonetim/db";

import { ContextResolver } from "../../identity/context-resolver.service";
import { DbService } from "../../infra/db/db.service";
import { env } from "../../infra/config/env";
import { ASSISTANT_SCREENS } from "./assistant.screens";

/**
 * Dijital Asistan veri ucu — sözleşme: Dijital Asistan `docs/uygulama-baglantisi.md` (v1).
 *
 * Asistanın kodu Vekil'de yok. Panel sayfasındaki script iki uca gelir:
 * - `context`: giriş yapan kullanıcının takma adı (HMAC), imza ve rolüne göre araçlar/ekranlar.
 * - `run`: tek bir aracı kullanıcının kendi oturumu ve yetkisiyle çalıştırır.
 *
 * Kayıtlar Vekil'den kullanıcının tarayıcısına gider; Dijital Asistan sunucusuna gitmez.
 * Gelen plan güvenilmez kabul edilir: araç rolde yoksa 404, kayıt kapsam dışındaysa boş sonuç.
 */
type Ctx = { userId: string; tenantId: string; roles: Role[]; locale: string };
type UnitArg = { id?: string; block?: string; number?: string; name?: string };
type Unit = { id: string; number: string; block: string | null; person?: string };

const fail = (status: number, message: string) => new HttpException({ error: { message } }, status);
const norm = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/\s+/g, "").replace(/^0+(?=\d)/, "");
const words = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").split(/[^a-z0-9]+/).filter(Boolean);
const money = (kurus: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(kurus / 100);
const dateText = (value: Date | string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(new Date(value));
const label = (unit: Unit) => {
  const block = unit.block ? (/blok$/i.test(unit.block.trim()) ? unit.block.trim() : unit.block.trim() + " Blok") + " · " : "";
  return `${block}${unit.number}${unit.person ? " — " + unit.person : ""}`;
};

@Injectable()
export class AssistantService {
  constructor(
    private readonly resolver: ContextResolver,
    private readonly db: DbService,
  ) {}

  private secret(): string {
    const secret = env().DA_SECRET;
    if (!secret) throw fail(404, "Asistan bu sitede açık değil.");
    return secret;
  }

  private async identity(request: Request): Promise<Ctx> {
    this.secret();
    // Yalnız panelin kendi oturum çerezi: mobil JWT, API anahtarı ve başka origin bu yüzeye giremez.
    const origin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : null;
    if (request.headers.authorization || (origin && request.headers.origin && request.headers.origin !== origin))
      throw fail(403, "Yalnızca panelin kendi oturumuyla erişilebilir.");
    const ctx = await this.resolver.fromSessionCookie(request);
    if (!ctx?.userId || isPlatformContext(ctx)) throw fail(401, "Panelde oturum açın.");
    const limit = await rateLimit({ key: "assistant", limit: 40, windowSeconds: 60 }, `${ctx.tenantId}:${ctx.userId}`);
    if (!limit.allowed) throw fail(429, "Çok fazla istek. Biraz sonra yeniden deneyin.");
    return { userId: ctx.userId, tenantId: ctx.tenantId, roles: ctx.roles, locale: ctx.locale };
  }

  private tools(roles: Role[]) {
    const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(roles, permission);
    const tools = [];
    if (can("debt:read") || can("debt:read_own"))
      tools.push({ name: "borc", title: "Borç durumu", description: "Bağımsız bölümün kalan ve vadesi geçmiş borcu",
        keywords: ["borç", "borcum", "bakiye", "aidat", "alacak", "ne kadar borç"], params: { unit: "unit" } });
    if (can("payment:read") || can("payment:read_own"))
      tools.push({ name: "odemeler", title: "Son ödemeler", description: "Bağımsız bölümün son ödemeleri",
        keywords: ["ödeme", "ödemeler", "ödemelerim", "tahsilat", "makbuz", "son ödeme"], params: { unit: "unit" } });
    const staff = !roles.every(isResidentRole);
    if (staff && can("unit:read"))
      tools.push({ name: "ozet", title: "Site özeti", description: "Bağımsız bölüm, sakin, alacak, talep ve bu ayın gider/tahsilat sayıları",
        keywords: ["özet", "kaç daire", "daire sayısı", "bağımsız bölüm sayısı", "kaç bağımsız bölüm", "sakin sayısı", "kaç sakin", "kaç kişi", "genel durum", "site durumu", "toplam alacak"] });
    if (can("expense:read"))
      tools.push({ name: "giderler", title: "Giderler", description: "Dönemin giderleri ve toplamı (varsayılan: bu ay)",
        keywords: ["gider", "giderler", "harcama", "masraf", "fatura", "ne harcandı"], params: { period: "period" } });
    if (can("request:read") || can("request:read_own"))
      tools.push({ name: "talepler", title: "Açık talepler", description: "Bekleyen arıza, şikâyet ve öneri talepleri",
        keywords: ["talep", "talepler", "bekleyen talep", "açık talep", "arıza", "şikayet", "taleplerim"] });
    if (staff && can("resident:read"))
      tools.push({ name: "sakinler", title: "Sakinler", description: "Bir bağımsız bölümde oturanlar veya isimle sakin arama",
        keywords: ["sakin", "sakinler", "kim oturuyor", "oturan", "malik", "kiracı", "ev sahibi"], params: { unit: "unit" } });
    if (can("agenda:read"))
      tools.push({ name: "takvim", title: "Takvim", description: "Takvimdeki görev ve notlar",
        keywords: ["takvim", "ajanda", "görev", "hatırlatma", "toplantı", "yapılacak"], params: { period: "period" } });
    return tools;
  }

  async context(request: Request) {
    const ctx = await this.identity(request), secret = this.secret();
    const sign = (text: string) => createHmac("sha256", secret).update(text).digest("base64url");
    const subject = sign(`${ctx.tenantId}:${ctx.userId}`), expires = Date.now() + 10 * 60_000;
    const audience = ctx.roles.length > 0 && ctx.roles.every(isResidentRole) ? "resident" : "staff";
    return {
      version: 1, subject, expires, signature: sign(`dijital-asistan:v1:${subject}:${expires}`),
      locale: ctx.locale.startsWith("en") ? "en" : "tr",
      tools: this.tools(ctx.roles),
      screens: ASSISTANT_SCREENS.filter((s) => s.audience.includes(audience) && hasPermission(ctx.roles, s.permission))
        .slice(0, 50).map(({ title, href, keywords }) => ({ title, href, keywords })),
    };
  }

  async run(request: Request, body: unknown) {
    const ctx = await this.identity(request);
    const input = (body && typeof body === "object" ? body : {}) as { tool?: unknown; args?: Record<string, unknown> };
    const tool = this.tools(ctx.roles).find((t) => t.name === input.tool);
    if (!tool) throw fail(404, "Bu bilgi için uygun araç yok.");
    const args = input.args && typeof input.args === "object" ? input.args : {};
    if (tool.name === "takvim") return this.agenda(ctx, args.period as { from?: string; to?: string } | undefined);
    if (tool.name === "ozet") return this.summary(ctx);
    if (tool.name === "giderler") return this.expenses(args.period as { from?: string; to?: string } | undefined);
    if (tool.name === "talepler") return this.requests(ctx, hasPermission(ctx.roles, "request:read"));
    if (tool.name === "sakinler") return this.residents(ctx, (args.unit && typeof args.unit === "object" ? args.unit : {}) as UnitArg);
    const any = hasPermission(ctx.roles, tool.name === "borc" ? "debt:read" : "payment:read");
    const unit = (args.unit && typeof args.unit === "object" ? args.unit : {}) as UnitArg;
    const found = await this.units(ctx, unit, any);
    if (found === "ask") return { kind: "ask", message: "Hangi bağımsız bölümün kaydını görmek istiyorsunuz? Blok ve daire numarasını ya da kişinin adını yazın." };
    if (found === "own-only") return { kind: "empty", message: "Yalnızca kendi bağımsız bölümlerinizin kayıtlarını görebilirsiniz." };
    if (!found.length) return { kind: "empty", message: unit.name ? `“${unit.name}” adına kayıtlı bir bağımsız bölüm bulunamadı.` : "Bu kapsamda erişilebilir bir kayıt bulunamadı." };
    if (found.length > 10) return { kind: "ask", message: "Birden fazla kayıt eşleşti. Blok ve daire numarasını birlikte yazın." };
    if (found.length > 1) return { kind: "choose", message: "Hangi bağımsız bölümü kastediyorsunuz?", options: found.map((u) => ({ label: label(u), args: { unit: { id: u.id } } })) };
    const [only] = found as [Unit];
    return tool.name === "borc" ? this.balance(only) : this.payments(only);
  }

  /** Kullanıcının görebileceği bölümler: sakin yalnız kendi aktif bölümleri, yetkili tüm site (seçiciyle). */
  private async units(ctx: Ctx, arg: UnitArg, any: boolean): Promise<Unit[] | "ask" | "own-only"> {
    const selector = { id: str(arg.id), block: str(arg.block), number: str(arg.number), name: str(arg.name) };
    if (!any && selector.name) return "own-only";
    if (any && !selector.id && !selector.block && !selector.number && !selector.name) return "ask";
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({ id: units.id, number: units.number, block: blocks.name, userId: unitOccupancies.userId, firstName: users.firstName, lastName: users.lastName })
        .from(units)
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .leftJoin(unitOccupancies, and(eq(unitOccupancies.unitId, units.id), isNull(unitOccupancies.endDate)))
        .leftJoin(users, eq(users.id, unitOccupancies.userId))
        .where(and(isNull(units.deletedAt), any ? undefined : eq(unitOccupancies.userId, ctx.userId)))
        .orderBy(asc(units.number))
        .limit(5000);
      const result = new Map<string, Unit>();
      for (const row of rows) {
        if (selector.id && row.id !== selector.id) continue;
        if (selector.number && norm(row.number) !== norm(selector.number)) continue;
        if (selector.block && norm(row.block ?? "").replace(/blok$/, "") !== norm(selector.block).replace(/blok$/, "")) continue;
        const person = [row.firstName, row.lastName].filter(Boolean).join(" ");
        // "ali" → "Mehmet Ali Ayan" evet, "Samet Çalışır" hayır: her aranan kelime bir ad/soyad başı olmalı.
        if (selector.name && !words(selector.name).every((part) => words(person).some((word) => word.startsWith(part)))) continue;
        if (!result.has(row.id)) result.set(row.id, { id: row.id, number: row.number, block: row.block, ...(selector.name ? { person } : {}) });
      }
      return [...result.values()].slice(0, 11);
    });
  }

  private async balance(unit: Unit) {
    return this.db.tx(async (tx) => {
      const open = await tx
        .select({ description: debts.description, period: debts.period, dueDate: debts.dueDate,
          remaining: sql<number>`${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}` })
        .from(debts)
        .where(and(eq(debts.unitId, unit.id), isNull(debts.deletedAt), notInArray(debts.status, ["paid", "written_off", "cancelled"])))
        .orderBy(asc(debts.dueDate));
      const now = Date.now();
      const total = open.reduce((sum, d) => sum + Number(d.remaining), 0);
      const overdue = open.filter((d) => d.dueDate && new Date(d.dueDate).getTime() < now).reduce((sum, d) => sum + Number(d.remaining), 0);
      return {
        kind: "result", title: label(unit),
        fields: [{ label: "Kalan borç", value: money(total) }, { label: "Vadesi geçmiş", value: money(overdue) }],
        items: open.filter((d) => Number(d.remaining) > 0).slice(0, 5).map((d) => ({
          title: d.description, ...(d.dueDate ? { subtitle: `Son ödeme ${dateText(d.dueDate)}` } : {}), value: money(Number(d.remaining)) })),
        links: [{ label: "Bağımsız bölüm kartı", href: `/panel/birimler/${unit.id}` }],
        note: "Vekil'in canlı kaydı", asOf: new Date().toISOString(),
      };
    });
  }

  private async payments(unit: Unit) {
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({ paidAt: payments.paidAt, createdAt: payments.createdAt, amount: payments.amountKurus, status: payments.status, method: payments.method })
        .from(payments)
        .where(eq(payments.unitId, unit.id))
        .orderBy(sql`${payments.paidAt} DESC NULLS LAST`, desc(payments.createdAt))
        .limit(6);
      if (!rows.length) return { kind: "empty", message: `${label(unit)} için ödeme kaydı yok.` };
      return {
        kind: "result", title: label({ ...unit, person: undefined }),
        items: rows.map((row) => ({ title: dateText(row.paidAt ?? row.createdAt), subtitle: `${METHOD[row.method] ?? "Diğer"} · ${STATUS[row.status] ?? row.status}`, value: money(Number(row.amount)) })),
        links: [{ label: "Bağımsız bölüm kartı", href: `/panel/birimler/${unit.id}` }],
        note: "Vekil'in canlı kaydı · son 6 ödeme", asOf: new Date().toISOString(),
      };
    });
  }

  /** Sayılar: yalnız kullanıcının izinli olduğu kalemler eklenir. */
  private async summary(ctx: Ctx) {
    const can = (permission: Parameters<typeof hasPermission>[1]) => hasPermission(ctx.roles, permission);
    const month = monthRange(), fields: { label: string; value: string }[] = [];
    return this.db.tx(async (tx) => {
      const [unitCount] = await tx.select({ n: sql<number>`count(*)` }).from(units).where(isNull(units.deletedAt));
      const [people] = await tx.select({ n: sql<number>`count(DISTINCT ${unitOccupancies.userId})` }).from(unitOccupancies)
        .innerJoin(units, and(eq(units.id, unitOccupancies.unitId), isNull(units.deletedAt))).where(isNull(unitOccupancies.endDate));
      fields.push({ label: "Bağımsız bölüm", value: String(Number(unitCount?.n ?? 0)) }, { label: "Kayıtlı sakin", value: String(Number(people?.n ?? 0)) });
      if (can("debt:read")) {
        const [debt] = await tx.select({
          total: sql<number>`COALESCE(SUM(${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus}), 0)`,
          overdue: sql<number>`COALESCE(SUM(CASE WHEN ${debts.dueDate} < now() THEN ${debts.amountKurus} + ${debts.lateFeeKurus} - ${debts.paidKurus} ELSE 0 END), 0)` })
          .from(debts).where(and(isNull(debts.deletedAt), notInArray(debts.status, ["paid", "written_off", "cancelled"])));
        fields.push({ label: "Toplam alacak", value: money(Number(debt?.total ?? 0)) }, { label: "Vadesi geçmiş", value: money(Number(debt?.overdue ?? 0)) });
      }
      if (can("request:read")) {
        const [open] = await tx.select({ n: sql<number>`count(*)` }).from(requests)
          .where(and(isNull(requests.deletedAt), notInArray(requests.status, ["resolved", "closed", "rejected"])));
        fields.push({ label: "Açık talep", value: String(Number(open?.n ?? 0)) });
      }
      if (can("expense:read")) {
        const [spent] = await tx.select({ total: sql<number>`COALESCE(SUM(${expenses.amountKurus}), 0)` }).from(expenses)
          .where(and(isNull(expenses.deletedAt), notInArray(expenses.status, ["draft", "rejected"]), gte(expenses.expenseDate, month.start), lte(expenses.expenseDate, month.end)));
        fields.push({ label: "Bu ay gider", value: money(Number(spent?.total ?? 0)) });
      }
      if (can("payment:read")) {
        const [paid] = await tx.select({ total: sql<number>`COALESCE(SUM(${payments.amountKurus}), 0)` }).from(payments)
          .where(and(eq(payments.status, "completed"), gte(payments.paidAt, month.start), lte(payments.paidAt, month.end)));
        fields.push({ label: "Bu ay tahsilat", value: money(Number(paid?.total ?? 0)) });
      }
      return { kind: "result", title: "Site özeti", fields, links: [{ label: "Paneli aç", href: "/panel" }], note: "Vekil'in canlı kaydı", asOf: new Date().toISOString() };
    });
  }

  /** Dönemin onaylı giderleri; dönem yoksa bu ay. */
  private async expenses(period: { from?: string; to?: string } | undefined) {
    const valid = (value?: string) => (value && /^\d{4}-\d\d-\d\d$/.test(value) ? value : undefined);
    const month = monthRange();
    const start = valid(period?.from) ? new Date(`${period!.from}T00:00:00+03:00`) : month.start;
    const end = valid(period?.to) ? new Date(`${period!.to}T23:59:59+03:00`) : month.end;
    return this.db.tx(async (tx) => {
      const where = and(isNull(expenses.deletedAt), notInArray(expenses.status, ["draft", "rejected"]), gte(expenses.expenseDate, start), lte(expenses.expenseDate, end));
      const [sum] = await tx.select({ total: sql<number>`COALESCE(SUM(${expenses.amountKurus}), 0)`, n: sql<number>`count(*)` }).from(expenses).where(where);
      const rows = await tx.select({ id: expenses.id, description: expenses.description, vendor: expenses.vendorName, date: expenses.expenseDate, amount: expenses.amountKurus, status: expenses.status })
        .from(expenses).where(where).orderBy(desc(expenses.amountKurus)).limit(8);
      const range = `${dateText(start)} – ${dateText(end)}`;
      if (!rows.length) return { kind: "empty", message: `${range} arasında gider kaydı yok.` };
      return {
        kind: "result", title: `Giderler · ${range}`,
        fields: [{ label: "Toplam", value: money(Number(sum?.total ?? 0)) }, { label: "Kayıt", value: String(Number(sum?.n ?? 0)) }],
        items: rows.map((row) => ({ title: row.description, subtitle: [row.vendor, dateText(row.date), EXPENSE_STATUS[row.status] ?? row.status].filter(Boolean).join(" · "), value: money(Number(row.amount)), href: `/panel/giderler/${row.id}` })),
        links: [{ label: "Giderler", href: "/panel/giderler" }],
        note: "En yüksek 8 gider · Vekil'in canlı kaydı", asOf: new Date().toISOString(),
      };
    });
  }

  /** Kapanmamış talepler: yetkili tüm site, sakin kendi açtıkları. */
  private async requests(ctx: Ctx, all: boolean) {
    return this.db.tx(async (tx) => {
      const where = and(isNull(requests.deletedAt), notInArray(requests.status, ["resolved", "closed", "rejected"]), all ? undefined : eq(requests.createdByUserId, ctx.userId));
      const [count] = await tx.select({ n: sql<number>`count(*)` }).from(requests).where(where);
      const rows = await tx.select({ id: requests.id, code: requests.code, title: requests.title, status: requests.status, priority: requests.priority, createdAt: requests.createdAt })
        .from(requests).where(where).orderBy(desc(requests.createdAt)).limit(8);
      if (!rows.length) return { kind: "empty", message: "Bekleyen talep yok." };
      return {
        kind: "result", title: `Açık talepler · ${Number(count?.n ?? rows.length)}`,
        items: rows.map((row) => ({ title: `${row.code} · ${row.title}`, subtitle: `${REQUEST_STATUS[row.status] ?? row.status} · ${PRIORITY[row.priority] ?? row.priority} · ${dateText(row.createdAt)}`,
          href: all ? `/panel/talepler/${row.id}` : "/panel/taleplerim" })),
        links: [{ label: all ? "Talepler" : "Taleplerim", href: all ? "/panel/talepler" : "/panel/taleplerim" }],
        note: "Son 8 talep · Vekil'in canlı kaydı", asOf: new Date().toISOString(),
      };
    });
  }

  /** Bir bölümde oturanlar veya isimle sakin arama; seçici yoksa toplam ve ekran bağlantısı. */
  private async residents(ctx: Ctx, arg: UnitArg) {
    const selector = { id: str(arg.id), block: str(arg.block), number: str(arg.number), name: str(arg.name) };
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({ unitId: units.id, number: units.number, block: blocks.name, relation: unitOccupancies.relation, firstName: users.firstName, lastName: users.lastName, userId: users.id })
        .from(unitOccupancies)
        .innerJoin(units, and(eq(units.id, unitOccupancies.unitId), isNull(units.deletedAt)))
        .leftJoin(blocks, eq(blocks.id, units.blockId))
        .innerJoin(users, eq(users.id, unitOccupancies.userId))
        .where(isNull(unitOccupancies.endDate))
        .orderBy(asc(units.number))
        .limit(5000);
      const any = selector.id || selector.block || selector.number || selector.name;
      if (!any) return { kind: "result", title: "Sakinler", fields: [{ label: "Kayıtlı sakin", value: String(new Set(rows.map((r) => r.userId)).size) }],
        links: [{ label: "Sakinler", href: "/panel/sakinler" }], note: "Bir kişiyi görmek için daire numarasını veya adını yazın." };
      const matches = rows.filter((row) => {
        if (selector.id && row.unitId !== selector.id) return false;
        if (selector.number && norm(row.number) !== norm(selector.number)) return false;
        if (selector.block && norm(row.block ?? "").replace(/blok$/, "") !== norm(selector.block).replace(/blok$/, "")) return false;
        const person = [row.firstName, row.lastName].filter(Boolean).join(" ");
        return !selector.name || words(selector.name).every((part) => words(person).some((word) => word.startsWith(part)));
      }).slice(0, 15);
      if (!matches.length) return { kind: "empty", message: "Bu kapsamda kayıtlı sakin bulunamadı." };
      return {
        kind: "result", title: "Sakinler",
        items: matches.map((row) => ({ title: [row.firstName, row.lastName].filter(Boolean).join(" ") || "İsimsiz kayıt",
          subtitle: `${label({ id: row.unitId, number: row.number, block: row.block })} · ${RELATION[row.relation] ?? row.relation}`, href: `/panel/sakinler/${row.userId}` })),
        links: [{ label: "Sakinler", href: "/panel/sakinler" }],
      };
    });
  }

  /** Kullanıcının kendi ve paylaşılan takvim kayıtları; dönem yoksa bugünden itibaren 7 gün. */
  private async agenda(ctx: Ctx, period: { from?: string; to?: string } | undefined) {
    const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const valid = (value?: string) => (value && /^\d{4}-\d\d-\d\d$/.test(value) ? value : undefined);
    const from = valid(period?.from) ?? today;
    const to = valid(period?.to) ?? new Date(Date.parse(from) + 6 * 86_400_000).toISOString().slice(0, 10);
    return this.db.tx(async (tx) => {
      const rows = await tx
        .select({ title: agendaItems.title, day: agendaItems.day, kind: agendaItems.kind, doneAt: agendaItems.doneAt })
        .from(agendaItems)
        .where(and(isNull(agendaItems.deletedAt), gte(agendaItems.day, from), lte(agendaItems.day, to),
          or(eq(agendaItems.shared, true), eq(agendaItems.createdBy, ctx.userId))))
        .orderBy(asc(agendaItems.day))
        .limit(20);
      if (!rows.length) return { kind: "empty", message: `${dateText(from)} – ${dateText(to)} arasında takvim kaydı yok.` };
      return {
        kind: "result", title: `Takvim · ${dateText(from)} – ${dateText(to)}`,
        items: rows.map((row) => ({ title: row.title, subtitle: `${row.day ? dateText(row.day) : ""}${row.kind === "task" ? " · Görev" : " · Not"}${row.doneAt ? " · Tamamlandı" : ""}` })),
        links: [{ label: "Takvimi aç", href: "/panel/takvim" }],
      };
    });
  }
}

/** İstanbul'a göre bu ayın başı ve sonu. */
function monthRange(): { start: Date; end: Date } {
  const local = new Date(Date.now() + 3 * 3600_000), y = local.getUTCFullYear(), m = local.getUTCMonth();
  return { start: new Date(Date.UTC(y, m, 1) - 3 * 3600_000), end: new Date(Date.UTC(y, m + 1, 1) - 3 * 3600_000 - 1) };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= 80 ? value.trim() : undefined;
}

const STATUS: Record<string, string> = { initiated: "Başlatıldı", pending_3ds: "Bekliyor", authorized: "Onaylandı", completed: "Tamamlandı", failed: "Başarısız", refunded: "İade", chargeback: "Ters ibraz" };
const METHOD: Record<string, string> = { card: "Kart", bank_transfer: "Havale/EFT", auto_debit: "Otomatik ödeme", cash: "Nakit", credit_balance: "Alacak mahsubu", offset: "Mahsup" };
const EXPENSE_STATUS: Record<string, string> = { pending_approval: "Onay bekliyor", approved: "Onaylı", paid: "Ödendi" };
const REQUEST_STATUS: Record<string, string> = { open: "Açık", assigned: "Atandı", in_progress: "İşlemde", waiting_resident: "Sakin bekleniyor" };
const PRIORITY: Record<string, string> = { critical: "Kritik", high: "Yüksek", normal: "Normal", low: "Düşük" };
const RELATION: Record<string, string> = { owner: "Malik", tenant: "Kiracı", vacant: "Boş" };
