import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { BrandMark, Card, CardBody } from "@yonetim/ui";

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
 * kendine yönlendirirdi. Kontrol yalnız çerezin varlığı; gerçek doğrulama
 * kurulum ucunda (oturum geçersizse 401 → `/giris`).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("app.setup");
  return { title: t("title"), robots: { index: false } };
}

export default async function SetupPage() {
  if (!(await hasSessionCookie())) redirect("/giris?devam=/kurulum");

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
