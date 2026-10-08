import { getTranslations } from "next-intl/server";
import { Bell, CheckCircle2, Circle, Pencil, Plus, StickyNote, Users } from "lucide-react";

import { hasPermission } from "@yonetim/auth/guard";
import { agendaItem, agendaList, unitOptionList, type AgendaItem } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, Input, Select, Textarea, cn } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { ActionButton } from "@/components/form/action-button";
import { ActionDrawerButton } from "@/components/form/action-drawer-button";
import { FormField } from "@/components/form/action-form";
import Link from "@/components/link";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { deleteAgendaItem, saveAgendaItem, setAgendaDone } from "./actions";

export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** İstanbul günü `YYYY-MM-DD`. */
function todayIstanbul(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` ± gün (UTC öğlen üzerinden: yaz saati yok, kayma yok). */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pazartesi = 0. */
function weekdayMon(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Ajanda — aylık takvim, gün paneli, tarihsiz notlar.
 *
 * Adres durumu taşıyor (`?ay=&gun=&daire=`): sayfa yenilenince ve bildirimden
 * gelinince (`?kayit=`) aynı gün açık kalsın. Kayıtlar kişisel ya da ekiple
 * paylaşılan; site ayrımı RLS'te, daire filtresi burada.
 */
export default async function CalendarPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePermission("agenda:read");
  const canWrite = hasPermission(ctx.roles, "agenda:write");
  const t = await getTranslations("app.agenda");
  const tCommon = await getTranslations("common");
  const f = await formatters();
  const params = await searchParams;
  const today = todayIstanbul();

  // Bildirimden gelindi: kaydın gününü aç.
  const linked =
    params.kayit && UUID.test(params.kayit)
      ? await apiGet(`/v1/panel/agenda/${params.kayit}`, agendaItem).catch(() => null)
      : null;

  const unitId = params.daire && UUID.test(params.daire) ? params.daire : undefined;
  const selected =
    (linked?.day ?? null) || (params.gun && DAY.test(params.gun) ? params.gun : null) || today;
  const month = params.ay && MONTH.test(params.ay) && !linked ? params.ay : selected.slice(0, 7);

  const first = `${month}-01`;
  const gridStart = addDays(first, -weekdayMon(first));
  const lastOfMonth = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridEnd = addDays(lastOfMonth, 6 - weekdayMon(lastOfMonth));

  const [range, notes, units] = await Promise.all([
    apiGet(
      `/v1/panel/agenda?${toQuery({ from: gridStart, to: gridEnd, ...(unitId ? { unitId } : {}) })}`,
      agendaList,
    ),
    apiGet("/v1/panel/agenda/notes", agendaList),
    apiGet("/v1/panel/units/options", unitOptionList).catch(() => []),
  ]);

  const byDay = new Map<string, AgendaItem[]>();
  for (const item of range.rows) {
    if (!item.day) continue;
    byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  }
  const dayItems = byDay.get(selected) ?? [];
  const undated = notes.rows.filter((n) => !n.day && (!unitId || n.unitId === unitId));

  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(f.locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${addDays("2024-01-01", i)}T12:00:00Z`), // 2024-01-01 Pazartesi
    ),
  );

  const href = (q: Record<string, string | undefined>) => {
    const merged = { ay: month, gun: selected, daire: unitId, ...q };
    const qs = new URLSearchParams(
      Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])),
    ).toString();
    return `/panel/takvim${qs ? `?${qs}` : ""}`;
  };
  const dayLabel = (iso: string) => f.date(new Date(`${iso}T12:00:00`));
  const unitName = (u: { blockName: string | null; number: string }) =>
    u.blockName ? `${u.blockName} / ${u.number}` : u.number;

  const fields = (item?: AgendaItem, kind: AgendaItem["kind"] = "task") => (
    <>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <FormField name="kind" label={t("kind")}>
        <Select name="kind" defaultValue={item?.kind ?? kind}>
          <option value="task">{t("kindTask")}</option>
          <option value="note">{t("kindNote")}</option>
        </Select>
      </FormField>
      <FormField name="title" label={t("titleField")} required>
        <Input name="title" defaultValue={item?.title} maxLength={200} required />
      </FormField>
      <FormField name="body" label={t("body")}>
        <Textarea name="body" defaultValue={item?.body ?? ""} rows={4} maxLength={5000} />
      </FormField>
      <FormField name="unitId" label={t("unit")} hint={t("unitHint")}>
        <Select name="unitId" defaultValue={item?.unitId ?? unitId ?? ""}>
          <option value="">{t("unitNone")}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {unitName(u)}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField name="day" label={t("day")} hint={t("dayHint")}>
          <Input name="day" type="date" defaultValue={item ? (item.day ?? "") : selected} />
        </FormField>
        <FormField name="time" label={t("time")} hint={t("timeHint")}>
          <Input name="time" type="time" defaultValue={item?.time ?? ""} />
        </FormField>
      </div>
      <label className="flex items-start gap-2 text-sm text-fg">
        <input
          type="checkbox"
          name="remind"
          defaultChecked={item ? Boolean(item.remindAt) : true}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          {t("remind")}
          <span className="block text-xs text-fg-subtle">{t("remindHint")}</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-fg">
        <input type="checkbox" name="shared" defaultChecked={item?.shared ?? false} className="mt-0.5 h-4 w-4" />
        <span>
          {t("shared")}
          <span className="block text-xs text-fg-subtle">{t("sharedHint")}</span>
        </span>
      </label>
    </>
  );

  const row = (item: AgendaItem) => {
    const done = Boolean(item.doneAt);
    return (
      <li key={item.id} className="flex gap-3 border-b border-border py-3 last:border-0">
        <span aria-hidden className="mt-0.5 shrink-0 text-fg-subtle">
          {item.kind === "note" ? (
            <StickyNote className="h-4 w-4" />
          ) : done ? (
            <CheckCircle2 className="h-4 w-4 text-success-fg" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn("break-words text-sm font-semibold text-fg", done && "text-fg-subtle line-through")}>
            {item.title}
          </div>
          {item.body ? (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-fg-muted">{item.body}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
            <Badge tone={item.kind === "task" ? "info" : "neutral"}>
              {item.kind === "task" ? t("kindTask") : t("kindNote")}
            </Badge>
            {item.unitLabel ? <Badge tone="neutral">{item.unitLabel}</Badge> : null}
            {item.time ? (
              <span className="inline-flex items-center gap-1">
                <Bell aria-hidden className="h-3 w-3" />
                {item.time}
                {item.remindedAt ? ` · ${t("reminded")}` : ""}
              </span>
            ) : null}
            {item.shared ? (
              <span className="inline-flex items-center gap-1">
                <Users aria-hidden className="h-3 w-3" />
                {item.mine ? t("sharedByMe") : (item.createdByName ?? t("sharedLabel"))}
              </span>
            ) : null}
          </div>
          {canWrite ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.kind === "task" ? (
                <ActionButton
                  action={setAgendaDone}
                  fields={{ id: item.id, done: done ? "false" : "true" }}
                  label={done ? t("markOpen") : t("markDone")}
                  tone={done ? "neutral" : "primary"}
                />
              ) : null}
              <ActionDrawerButton
                action={saveAgendaItem}
                hidden={{}}
                icon={<Pencil />}
                label={tCommon("action.edit")}
                title={t("editTitle")}
                submitLabel={tCommon("action.save")}
              >
                {fields(item)}
              </ActionDrawerButton>
              <ActionButton action={deleteAgendaItem} fields={{ id: item.id }} label={tCommon("action.delete")} tone="danger" />
            </div>
          ) : null}
        </div>
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          canWrite ? (
            <ActionDrawerButton
              action={saveAgendaItem}
              hidden={{}}
              icon={<Plus />}
              label={t("add")}
              title={t("addTitle")}
              description={t("addHint", { day: dayLabel(selected) })}
              submitLabel={tCommon("action.save")}
              tone="primary"
            >
              {fields()}
            </ActionDrawerButton>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            title={f.period(month)}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <form method="get" className="flex items-center gap-2">
                  <input type="hidden" name="ay" value={month} />
                  <input type="hidden" name="gun" value={selected} />
                  <label className="sr-only" htmlFor="agenda-unit">
                    {t("unitFilter")}
                  </label>
                  <Select id="agenda-unit" name="daire" defaultValue={unitId ?? ""} className="h-9 w-40">
                    <option value="">{t("allUnits")}</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {unitName(u)}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
                  >
                    {t("filter")}
                  </button>
                </form>
                <nav aria-label={t("monthNav")} className="flex items-center gap-1">
                  <Link
                    href={href({ ay: shiftMonth(month, -1), gun: undefined })}
                    className="inline-flex h-9 items-center rounded-lg border border-border-strong px-2.5 text-sm text-fg hover:bg-hover"
                    aria-label={t("prevMonth")}
                  >
                    ‹
                  </Link>
                  <Link
                    href={href({ ay: today.slice(0, 7), gun: today })}
                    className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover"
                  >
                    {t("today")}
                  </Link>
                  <Link
                    href={href({ ay: shiftMonth(month, 1), gun: undefined })}
                    className="inline-flex h-9 items-center rounded-lg border border-border-strong px-2.5 text-sm text-fg hover:bg-hover"
                    aria-label={t("nextMonth")}
                  >
                    ›
                  </Link>
                </nav>
              </div>
            }
          />
          <CardBody className="p-2 sm:p-3">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
              {weekdayNames.map((name) => (
                <div key={name} className="bg-surface-sunken px-1 py-1.5 text-center text-[11px] font-semibold uppercase text-fg-subtle">
                  {name}
                </div>
              ))}
              {days.map((d) => {
                const items = byDay.get(d) ?? [];
                const inMonth = d.startsWith(month);
                const isToday = d === today;
                const isSelected = d === selected;
                const openTasks = items.filter((i) => i.kind === "task" && !i.doneAt).length;
                return (
                  <Link
                    key={d}
                    href={href({ gun: d, ay: month })}
                    aria-current={isSelected ? "date" : undefined}
                    aria-label={`${dayLabel(d)}${items.length ? ` — ${t("countItems", { count: items.length })}` : ""}`}
                    className={cn(
                      "flex min-h-14 flex-col gap-0.5 bg-surface p-1 text-left hover:bg-hover sm:min-h-24 sm:p-1.5",
                      !inMonth && "bg-surface-sunken text-fg-subtle",
                      isSelected && "outline outline-2 -outline-offset-2 outline-primary",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                        isToday ? "bg-primary font-bold text-primary-fg" : "text-fg",
                        !inMonth && !isToday && "text-fg-subtle",
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                    {/* Dar ekranda yalnız sayı rozeti; geniş ekranda başlıklar. */}
                    {items.length > 0 ? (
                      <span className="sm:hidden">
                        <span className={cn("inline-flex min-w-4 justify-center rounded px-1 text-[10px] font-bold", openTasks ? "bg-primary-soft text-primary-soft-fg" : "bg-surface-sunken text-fg-subtle")}>
                          {items.length}
                        </span>
                      </span>
                    ) : null}
                    <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                      {items.slice(0, 3).map((i) => (
                        <span
                          key={i.id}
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-[11px] leading-tight",
                            i.kind === "task" ? "bg-primary-soft text-primary-soft-fg" : "bg-surface-sunken text-fg-muted",
                            i.doneAt && "line-through opacity-70",
                          )}
                        >
                          {i.time ? `${i.time} ` : ""}
                          {i.title}
                        </span>
                      ))}
                      {items.length > 3 ? (
                        <span className="text-[11px] text-fg-subtle">{t("more", { count: items.length - 3 })}</span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              title={dayLabel(selected)}
              description={selected === today ? t("todayLabel") : undefined}
              action={
                canWrite ? (
                  <ActionDrawerButton
                    action={saveAgendaItem}
                    hidden={{}}
                    icon={<Plus />}
                    label={t("addShort")}
                    title={t("addTitle")}
                    description={t("addHint", { day: dayLabel(selected) })}
                    submitLabel={tCommon("action.save")}
                  >
                    {fields()}
                  </ActionDrawerButton>
                ) : null
              }
            />
            <CardBody className="pt-0">
              {dayItems.length === 0 ? (
                <p className="py-4 text-sm text-fg-subtle">{t("emptyDay")}</p>
              ) : (
                <ul>{dayItems.map(row)}</ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("undatedTitle")} description={t("undatedHint")} />
            <CardBody className="pt-0">
              {undated.length === 0 ? (
                <p className="py-4 text-sm text-fg-subtle">{t("undatedEmpty")}</p>
              ) : (
                <ul>{undated.map(row)}</ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
