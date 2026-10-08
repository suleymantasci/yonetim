import { getTranslations } from "next-intl/server";

import { meetingListResponse } from "@yonetim/contracts";
import { Alert, Card, CardBody, CardHeader, Select, Textarea } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { EvrakNav } from "../evrak-nav";
import { DEFAULT_CALL_TEXT } from "../templates";

export const dynamic = "force-dynamic";

/**
 * Genel kurul çağrı mektubu ve vekaletname — toplantı kaydından (tarih,
 * yer, ikinci toplantı, gündem) her malike ayrı sayfa. Çağrının tebliği
 * (KMK md.29: en az 15 gün önce) toplantı ekranında kaydedilir.
 */
export default async function MeetingLettersPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("meeting:read");
  const t = await getTranslations("app.letters");
  const tEnum = await getTranslations("enum");
  const f = await formatters();
  const params = await searchParams;
  const { rows } = await apiGet("/v1/panel/communication/meetings", meetingListResponse);
  const upcoming = [...rows].sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
  const meeting = upcoming.find((m) => m.id === params.toplanti) ?? upcoming[0];
  const agenda = (meeting?.agenda ?? []) as string[];

  return (
    <>
      <PageHeader title={t("title")} description={t("meetingDescription")} />
      <EvrakNav active="meeting" />

      {!meeting ? (
        <Alert tone="info">{t("noMeetings")}</Alert>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <CardHeader title={t("meeting")} />
            <CardBody className="space-y-3 text-sm">
              <form method="get" className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs text-fg-subtle">
                  {t("meeting")}
                  <Select name="toplanti" defaultValue={meeting.id} className="mt-0.5 h-9">
                    {upcoming.map((m) => (
                      <option key={m.id} value={m.id}>
                        {f.date(m.scheduledAt)} · {m.title}
                      </option>
                    ))}
                  </Select>
                </label>
                <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-hover">
                  {t("choose")}
                </button>
              </form>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-fg-subtle">{t("kindLabel")}</dt>
                <dd>{tEnum(`meetingKind.${meeting.kind}`)}</dd>
                <dt className="text-fg-subtle">{t("firstCall")}</dt>
                <dd>{f.dateTime(meeting.scheduledAt)}</dd>
                <dt className="text-fg-subtle">{t("secondCall")}</dt>
                <dd>{meeting.secondCallAt ? f.dateTime(meeting.secondCallAt) : "—"}</dd>
                <dt className="text-fg-subtle">{t("place")}</dt>
                <dd>{meeting.location ?? meeting.onlineUrl ?? "—"}</dd>
              </dl>
              {agenda.length > 0 ? (
                <ol className="list-inside list-decimal text-sm">
                  {agenda.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ol>
              ) : (
                <Alert tone="warning">{t("noAgenda")}</Alert>
              )}
            </CardBody>
          </Card>

          <div className="space-y-4 lg:col-span-3">
            <Card>
              <CardHeader title={t("callLetter")} description={t("callLetterHint")} />
              <CardBody>
                <form method="post" action="/panel/evrak/genel-kurul/pdf" target="_blank" className="space-y-3">
                  <input type="hidden" name="toplanti" value={meeting.id} />
                  <input type="hidden" name="tur" value="cagri" />
                  <Textarea name="body" rows={8} defaultValue={DEFAULT_CALL_TEXT} maxLength={6000} />
                  <div className="flex justify-end">
                    <button type="submit" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover">
                      {t("callLetterPdf")}
                    </button>
                  </div>
                </form>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={t("proxy")} description={t("proxyHint")} />
              <CardBody className="flex flex-wrap justify-end gap-2">
                <a
                  href={`/panel/evrak/genel-kurul/pdf?toplanti=${meeting.id}&tur=vekalet&bos=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center rounded-lg border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-hover"
                >
                  {t("proxyBlank")}
                </a>
                <a
                  href={`/panel/evrak/genel-kurul/pdf?toplanti=${meeting.id}&tur=vekalet`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
                >
                  {t("proxyPerOwner")}
                </a>
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
