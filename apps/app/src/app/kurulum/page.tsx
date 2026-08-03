import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { sessionProbe } from "@yonetim/contracts";
import { AppError } from "@yonetim/core";
import { BrandMark, Card, CardBody } from "@yonetim/ui";

import { apiGet } from "@/lib/api/server";
import { hasSessionCookie } from "@/lib/context";
import { SetupForm } from "./setup-form";

/**
 * İlk site kurulumu — hesabı olup hiç sitesi olmayan kullanıcı için.
 *
 * `requireContext()` bu durumu zaten buraya yönlendiriyordu ama sayfa yoktu.
 * Üstelik yönlendirme de çalışmıyordu: bağlam çözücü üyeliksiz kullanıcı için
 * kimlik üretmediğinden 401 dönüyor, o da `/giris`e gidiyordu — kullanıcı
 * giriş yapıyor, yine 401 alıyor, yine `/giris`e düşüyordu. Döngü
 * `lib/context.ts` içindeki çerez kontrolüyle kapatıldı.
 *
 * `requireContext()` BURADA ÇAĞRILMAZ: çağrılsaydı bu sayfa kendini tekrar
 * kendine yönlendirirdi.
 *
 * Render sırasında `/v1/auth/session-probe` ile oturum probe'u: 200 ⇒
 * çerezden geçerli oturum çözüldü (üyelik aranmaz), formu göster; 401 ⇒
 * çerez yok ya da süresi dolmuş, `/giris`'e yönlendir. Bu, `lib/context.ts`
 * içindeki çerez-varlığı proxy'sinin kaçırdığı "stale çerez" durumunu
 * render sırasında eliyor — kurulum formunu yanlışlıkla görme yüzeyi
 * kapanıyor.
 *
 * `auth/me` ve `auth/context` aynı amaçla kullanılamıyor: ikisi de
 * `TenantContextGuard`'tan geçiyor ve üyeliksiz kullanıcı için 401 dönüyor;
 * yani "stale çerez" ile "geçerli ama sitesi yok" durumlarını ayırt edemez.
 * `session-probe` bu iki durumu bilinçli olarak ayırıyor.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.setup");
  return { title: t("title"), robots: { index: false } };
}

export default async function SetupPage() {
  if (!(await hasSessionCookie())) redirect("/giris?devam=/kurulum");

  try {
    await apiGet("/v1/auth/session-probe", sessionProbe);
  } catch (error) {
    if (error instanceof AppError && error.code === "unauthorized") {
      redirect("/giris?devam=/kurulum");
    }
    throw error;
  }

  const t = await getTranslations("app.setup");

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto w-fit">
            <BrandMark size={44} />
          </div>
          <h1 className="mt-4 font-heading text-2xl font-extrabold text-fg">{t("title")}</h1>
          <p className="mt-1 text-sm text-fg-subtle">{t("subtitle")}</p>
        </div>

        <Card>
          <CardBody>
            <SetupForm />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
