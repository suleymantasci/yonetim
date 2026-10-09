import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardBody, CardHeader } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import Link from "@/components/link";
import { requirePermission } from "@/lib/context";
import { FAQ, LAW_LINKS, TEMPLATES } from "./content";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.knowledge");
  return { title: t("title") };
}

/** Bilgi bankası — mevzuat bağlantıları, sık sorulanlar, hazır yazışmalar. */
export default async function KnowledgePage() {
  await requirePermission("tenant:read");
  const t = await getTranslations("app.knowledge");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={t("faq")} />
          <CardBody className="space-y-2">
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-lg border border-border px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-semibold text-fg marker:hidden">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.a}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {item.refs.map((r) => (
                    <span key={r} className="rounded bg-surface-sunken px-1.5 py-0.5 font-medium text-fg-subtle">
                      {r}
                    </span>
                  ))}
                  {item.links?.map((l) => (
                    <Link key={l.href + l.label} href={l.href} className="font-semibold text-primary hover:underline">
                      {l.label}
                    </Link>
                  ))}
                </div>
              </details>
            ))}
            <p className="pt-2 text-xs text-fg-subtle">{t("disclaimer")}</p>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title={t("laws")} />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {LAW_LINKS.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer noopener" className="inline-flex items-start gap-1.5 text-primary hover:underline">
                      <ExternalLink aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("templates")} />
            <CardBody>
              <ul className="space-y-2 text-sm">
                {TEMPLATES.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-primary hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
