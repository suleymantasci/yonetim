import { getTranslations } from "next-intl/server";

import { portalMessagesResponse } from "@yonetim/contracts";
import { Card, CardBody, CardHeader, EmptyState } from "@yonetim/ui";

import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import { formatters } from "@/lib/format";
import { MessageForm } from "./message-form";

/**
 * "Mesajlarım" — sakinin yönetimle yazışması.
 *
 * NEDEN `/panel/mesajlar` DEĞİL: o ekran `message:read` istiyor ve sitedeki
 * **tüm** yazışmaları listeliyor. Sakinin o izni vardı ve menüde de görünüyordu
 * — yani her sakin komşularının yönetimle yazışmasını okuyabiliyordu. İzin
 * `message:read_own` ile daraltıldı, bu ekran da yalnız kendi yazışmasını
 * gösteren uca bağlandı (PROJE-DURUMU §5.8).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.myMessages");
  return { title: t("title") };
}

export default async function MyMessagesPage() {
  await requirePermission("message:read_own");
  const t = await getTranslations("app.myMessages");
  const f = await formatters();

  const { rows } = await apiGet("/v1/panel/portal/messages", portalMessagesResponse);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardHeader title={t("conversation")} />
          <CardBody className="space-y-3">
            {rows.length === 0 ? (
              <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            ) : (
              rows.map((m) => {
                // `in` = sakinden yönetime; kendi mesajı sağda.
                const mine = m.direction === "in";
                return (
                  <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={
                        mine
                          ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-primary-fg"
                          : "max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface-sunken px-3.5 py-2.5 text-fg"
                      }
                    >
                      {!mine ? (
                        <p className="text-xs text-fg-subtle">{t("management")}</p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">
                        {m.body ?? ""}
                      </p>
                      <p
                        className={
                          mine
                            ? "mt-1 text-[11px] opacity-70"
                            : "mt-1 text-[11px] text-fg-subtle"
                        }
                      >
                        {f.dateTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <MessageForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
