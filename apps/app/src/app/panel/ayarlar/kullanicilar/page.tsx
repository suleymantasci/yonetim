import { getTranslations } from "next-intl/server";

import { hasPermission } from "@yonetim/auth/guard";
import { teamList } from "@yonetim/contracts";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { TeamManager } from "./team-manager";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.team");
  return { title: t("title") };
}

/**
 * Program kullanıcıları — ikinci yönetici, muhasebeci, denetçi, personel.
 * Davet edilen kişi telefon ya da e-postasıyla kodla giriş yapar.
 */
export default async function TeamPage() {
  const ctx = await requirePermission("settings:read");
  const t = await getTranslations("app.team");
  const tSettings = await getTranslations("app.settings");
  const f = await formatters();
  const data = await apiGet("/v1/panel/team", teamList);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        breadcrumb={[{ label: tSettings("title"), href: "/panel/ayarlar" }, { label: t("title") }]}
      />
      <TeamManager
        rows={data.rows.map((r) => ({
          ...r,
          lastLogin: r.lastLoginAt ? f.dateTime(r.lastLoginAt) : null,
        }))}
        canWrite={hasPermission(ctx.roles, "settings:write")}
      />
    </>
  );
}
