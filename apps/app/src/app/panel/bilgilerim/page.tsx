import { getTranslations } from "next-intl/server";

import { kvkkOwnRequestList, portalProfile } from "@yonetim/contracts";
import { Alert, Badge, Card, CardBody, CardHeader, tableClasses as tc } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { can, requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { PasswordChange } from "./password-change";
import { KvkkRequestForm } from "./kvkk-requests";
import { PhoneChange } from "./phone-change";
import { ProfileForm } from "./profile-form";

/**
 * "Bilgilerim" — sakinin kendi kaydı ve bağımsız bölüm ilişkileri.
 *
 * TCKN ve telefon **maskeli** gösteriliyor, kendi kaydında bile: ham değer
 * uçtan çıktığı anda sunucu loglarına, hata izlerine ve tarayıcı önbelleğine
 * giriyor. "Kaydım doğru mu" sorusuna maskeli metin zaten yetiyor; yanlışsa
 * düzeltmek yöneticinin kimlik doğrulamalı işi.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.myProfile");
  return { title: t("title") };
}

export default async function MyProfilePage() {
  const ctx = await requirePermission("unit:read");
  const canKvkk = can(ctx, "kvkk:export_own");
  const t = await getTranslations("app.myProfile");
  const tEnum = await getTranslations("enum");
  const f = await formatters();

  const [profile, kvkk] = await Promise.all([
    apiGet("/v1/panel/portal/profile", portalProfile),
    canKvkk
      ? apiGet("/v1/panel/kvkk/my-requests", kvkkOwnRequestList)
      : Promise.resolve({ rows: [] }),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title={t("formTitle")} />
            <CardBody>
              <ProfileForm
                defaults={{
                  firstName: profile.firstName ?? "",
                  lastName: profile.lastName ?? "",
                  email: profile.email ?? "",
                  emergencyContactName: profile.emergencyContactName ?? "",
                  emergencyContactPhone: profile.emergencyContactPhone ?? "",
                }}
              />
            </CardBody>
          </Card>

          {canKvkk ? (
            <Card className="mt-4">
              <CardHeader title={t("kvkkTitle")} description={t("kvkkDescription")} />
              <CardBody className="space-y-4">
                {kvkk.rows.length > 0 ? (
                  <ul className="space-y-2">
                    {kvkk.rows.map((r) => (
                      <li key={r.id} className="rounded border border-border p-3 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-fg">{tEnum(`kvkkRequestType.${r.type}`)}</span>
                          <Badge tone={r.status === "fulfilled" ? "success" : r.status === "rejected" ? "neutral" : "warning"}>
                            {tEnum(`kvkkRequestStatus.${r.status}`)}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-fg-subtle">
                          {t("kvkkSentOn", { date: f.date(r.createdAt) })} ·{" "}
                          {t("kvkkLegalDue", { date: f.date(r.legalDueAt) })}
                        </div>
                        {r.responseNote ? (
                          <p className="mt-2 rounded bg-surface-sunken p-2 text-xs text-fg-muted">{r.responseNote}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <KvkkRequestForm />
              </CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          {/*
            Parola kutusu kimlik bilgilerinin üstünde: giriş artık parola
            soruyor ve parolası olmayan kullanıcılar (davetle açılmış hesaplar)
            bu ekrana ilk parolalarını belirlemek için geliyor.
          */}
          <Card>
            <CardHeader title={t("passwordTitle")} />
            <CardBody>
              <PasswordChange />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("identityTitle")} />
            <CardBody className="space-y-3 text-sm">
              <Row label={t("field.phone")} value={profile.phoneMasked ?? "—"} />
              <Row label={t("field.tckn")} value={profile.tcknMasked ?? "—"} />
              <Alert tone="info">{t("maskedHint")}</Alert>
              {/*
                Telefon **değiştirilebilir**, TCKN değil: numara kullanıcının
                kendi iletişim bilgisi ve hattını değiştirdiğinde güncellemesi
                gereken şey. TCKN ise kimlik kaydı; onu düzeltmek belge
                görmeyi gerektiriyor, yani yöneticinin işi.
              */}
              <PhoneChange currentPhoneMasked={profile.phoneMasked} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("unitsTitle")} />
            <CardBody className="p-0">
              {profile.units.length === 0 ? (
                <p className="p-4 text-sm text-fg-subtle">{t("noUnits")}</p>
              ) : (
                <div className={tc.wrapper}>
                  <table className={tc.table}>
                    <thead className={tc.thead}>
                      <tr>
                        <th className={tc.th}>{t("col.unit")}</th>
                        <th className={tc.th}>{t("col.relation")}</th>
                        <th className={tc.th}>{t("col.since")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profile.units.map((u) => (
                        <tr key={u.id} className={tc.tr}>
                          <td className={tc.td}>
                            {u.block ? `${u.block} · ` : ""}
                            {u.number}
                          </td>
                          <td className={tc.tdMuted}>
                            {tEnum(`ownership.${u.relation}`)}
                          </td>
                          <td className={tc.tdMuted}>
                            {u.startDate ? f.date(u.startDate) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-fg">{value}</dd>
    </div>
  );
}
