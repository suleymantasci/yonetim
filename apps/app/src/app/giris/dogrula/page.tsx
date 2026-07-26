import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { consumeVerificationToken, createSession, SESSION_COOKIE } from "@yonetim/auth";
import { users, withBypassRls } from "@yonetim/db";
import { Alert, Card, CardBody } from "@yonetim/ui";

/** Magic link doğrulama — SPEC Bölüm 14.2 (tek kullanımlık, 15 dk geçerli). */
export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>;
}) {
  const { e, t: linkToken } = await searchParams;
  const t = await getTranslations("app.login");

  if (!e || !linkToken) return <Failure message={t("invalidLink")} />;

  const result = await consumeVerificationToken({
    identifier: e,
    token: linkToken,
    purpose: "magic_link",
  });

  if (!result.ok) return <Failure message={t(`tokenError.${result.reason}`)} />;

  const userId = String((result.metadata as { userId?: string }).userId ?? "");
  if (!userId) return <Failure message={t("userNotFound")} />;

  const { token, expiresAt } = await createSession({ userId, rememberMe: true });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await withBypassRls("auth:magic-login", async (tx) => {
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  });

  redirect("/panel");
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
