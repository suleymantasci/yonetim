import { getTranslations } from "next-intl/server";

import { messageReportResponse } from "@yonetim/contracts";
import { Badge, Card, CardBody, CardHeader, Select, Stat, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet, toQuery } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { parseRange, RangeForm, ReportsSubnav } from "../report-tools";

export const dynamic = "force-dynamic";

/** SMS / e-posta / WhatsApp gönderim raporu — kime, ne, ne zaman, durumu, maliyeti. */
export default async function MessagesReportPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("report:read");
  const t = await getTranslations("app.reportsHub");
  const tm = await getTranslations("app.messageReport");
  const f = await formatters();
  const params = await searchParams;
  const { from, to } = parseRange(params);
  const channel = ["sms", "email", "whatsapp"].includes(params.kanal ?? "") ? params.kanal : undefined;
  const status = ["sent", "failed", "pending"].includes(params.durum ?? "") ? params.durum : undefined;
  const data = await apiGet(`/v1/panel/reports/debts/messages?${toQuery({ from, to, channel, status })}`, messageReportResponse);
  const tone = (s: string) => (s === "failed" ? "danger" : s === "queued" || s === "scheduled" ? "warning" : "success");

  return (
    <>
      <PageHeader title={tm("title")} description={tm("hint")} />
      <ReportsSubnav active="messages" />
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {(["sms", "email", "whatsapp"] as const).map((c) => {
          const agg = data.byChannel.find((b) => b.channel === c);
          return (
            <Stat
              key={c}
              label={tm(`channel.${c}`)}
              value={String((agg?.sent ?? 0) + (agg?.failed ?? 0) + (agg?.pending ?? 0))}
              hint={agg?.failed ? tm("failedCount", { count: agg.failed }) : undefined}
            />
          );
        })}
        <Stat label={tm("cost")} value={f.money(data.byChannel.reduce((s, b) => s + b.costMinor, 0))} />
      </div>
      <Card>
        <CardHeader
          title={t("rangeTitle", { from: f.date(new Date(`${from}T12:00:00`)), to: f.date(new Date(`${to}T12:00:00`)) })}
          action={
            <RangeForm from={from} to={to}>
              <label className="text-xs text-fg-subtle">
                {tm("channelLabel")}
                <Select name="kanal" defaultValue={channel ?? ""} className="mt-0.5 h-9">
                  <option value="">{tm("allChannels")}</option>
                  <option value="sms">{tm("channel.sms")}</option>
                  <option value="email">{tm("channel.email")}</option>
                  <option value="whatsapp">{tm("channel.whatsapp")}</option>
                </Select>
              </label>
              <label className="text-xs text-fg-subtle">
                {tm("statusLabel")}
                <Select name="durum" defaultValue={status ?? ""} className="mt-0.5 h-9">
                  <option value="">{tm("allStatuses")}</option>
                  <option value="sent">{tm("statusGroup.sent")}</option>
                  <option value="failed">{tm("statusGroup.failed")}</option>
                  <option value="pending">{tm("statusGroup.pending")}</option>
                </Select>
              </label>
            </RangeForm>
          }
        />
        <CardBody className="p-0">
          {data.rows.length === 0 ? (
            <p className="p-6 text-sm text-fg-subtle">{tm("empty")}</p>
          ) : (
            <div className={tc.wrapper}>
              <table className={tc.table}>
                <thead className={tc.thead}>
                  <tr>
                    <th className={tc.th}>{t("date")}</th>
                    <th className={tc.th}>{tm("channelLabel")}</th>
                    <th className={tc.th}>{tm("recipient")}</th>
                    <th className={tc.th}>{tm("subject")}</th>
                    <th className={tc.th}>{tm("statusLabel")}</th>
                    <th className={`${tc.th} text-right`}>{tm("cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className={tc.tr}>
                      <td className={`${tc.td} whitespace-nowrap`}>{f.dateTime(r.at)}</td>
                      <td className={tc.td}>{tm(`channel.${r.channel}` as "channel.sms")}</td>
                      <td className={tc.td}>
                        <span className="block">{r.recipientName ?? "—"}</span>
                        <span className="font-mono text-xs text-fg-subtle">{r.recipient}</span>
                      </td>
                      <td className={tc.td}>
                        <span className="block max-w-72 truncate">{r.subject ?? "—"}</span>
                        {r.error ? <span className="block max-w-72 truncate text-xs text-danger-fg">{r.error}</span> : null}
                      </td>
                      <td className={tc.td}>
                        <Badge tone={tone(r.status)}>{tm(`status.${r.status}` as "status.sent")}</Badge>
                      </td>
                      <td className={tc.tdNum}>{r.costMinor ? f.money(r.costMinor) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
