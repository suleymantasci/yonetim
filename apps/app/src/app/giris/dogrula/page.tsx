import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { webLoginSession } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";
import { Alert, Card, CardBody } from "@yonetim/ui";

import { apiPost } from "@/lib/api/server";
import { setSessionCookie } from "@/lib/session-cookie";

/**
 * Magic link doğrulama — SPEC Bölüm 14.2 (tek kullanımlık, 15 dk geçerli).
 *
 * Doğrulama ve oturum açma `apps/api`'de; burada kalan iş çerezi yazmak ve
 * başarısızlıkta anlaşılır bir sayfa göstermek.
 */
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e, t: linkToken } = await searchParams;
  const t = await getTranslations("app.login");

  if (!e || !linkToken) return <Failure message={t("invalidLink")} />;

  let session;
  try {
    session = await apiPost(
      "/v1/auth/web/verify",
      { identifier: e, token: linkToken },
      webLoginSession,
    );
  } catch (error) {
    if (error instanceof AppError) {
      const reason = reasonOf(error.details);
      if (error.code === "rate_limited") {
        return <Failure message={t("tooManyCodeAttempts")} />;
      }
      if (reason) {
        return (
          <Failure
            message={
              reason === "userNotFound"
                ? t("userNotFound")
                : t(`tokenError.${reason}`)
            }
          />
        );
      }
    }
    throw error;
  }

  await setSessionCookie(session.sessionToken, session.expiresAt);
  redirect("/panel");
}

function reasonOf(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : null;
}

async function Failure({ message }: { message: string }) {
  const t = await getTranslations("app.login");
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4">
          <Alert tone="danger" title={t("failedTitle")}>
            {message}
          </Alert>
          <a
            href="/giris"
            className="block rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            {t("requestNewLink")}
          </a>
        </CardBody>
      </Card>
    </div>
  );
}
