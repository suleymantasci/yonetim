import { cookies } from "next/headers";

import { SESSION_COOKIE } from "@yonetim/auth/cookie";

/**
 * Süper-admin'in kendi oturumunun saklandığı çerez.
 *
 * NEDEN AYRI BİR ÇEREZ: hesaba geçiş, tarayıcıdaki oturum çerezini hedef
 * kullanıcının jetonuyla **değiştiriyor**. Değiştirmeden önce yöneticinin
 * kendi jetonu bir yere konmazsa, geçişten dönüş yolu kalmaz — yönetici
 * yeniden giriş yapmak zorunda kalırdı ve bu, destek ekibinin her müşteri
 * bakışından sonra tekrarlanan bir sürtünme olurdu.
 *
 * Alternatif, oturum satırına "asıl kullanıcı" alanı koymaktı; ama o, `sessions`
 * tablosuna geçişin **taşıma** ayrıntısını taşımak olurdu. Jetonun nerede
 * durduğu tarayıcı tarafının sorunu ve orada kalıyor.
 */
const ADMIN_STASH_COOKIE = "yonetim_admin_session";

/** Çerez bayrakları oturum çerezinin aynısı; `HttpOnly` burada da şart. */
function flags(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/**
 * Yöneticinin oturumunu saklayıp hedef kullanıcının jetonunu yerine koyar.
 *
 * İki çerez **tek işlemde** yazılıyor: arada bir hata olsa yönetici ne kendi
 * oturumunda ne hedefin oturumunda kalırdı.
 */
export async function beginImpersonation(params: {
  targetToken: string;
  targetExpiresAt: Date;
}): Promise<void> {
  const store = await cookies();
  const adminToken = store.get(SESSION_COOKIE)?.value;

  if (adminToken) {
    /*
     * Sakla çerezinin ömrü impersonation oturumundan **uzun**: geçiş bitince
     * yönetici kendi oturumuna dönecek ve o oturumun ömrü bu çerezle
     * kısıtlanmamalı. 12 saat, oturum modülünün varsayılan ömrüyle aynı.
     */
    store.set(
      ADMIN_STASH_COOKIE,
      adminToken,
      flags(new Date(Date.now() + 12 * 3_600_000)),
    );
  }

  store.set(SESSION_COOKIE, params.targetToken, flags(params.targetExpiresAt));
}

/**
 * Yöneticinin oturumunu geri koyar. Saklanmış jeton yoksa oturum çerezi
 * **siliniyor**: impersonation oturumu bu noktada sunucuda zaten silinmiş
 * durumda ve elde geçersiz bir jetonla dolaşmak, kullanıcıyı her istekte
 * 401 alan bir kabukta bırakırdı.
 */
export async function endImpersonation(): Promise<{ restored: boolean }> {
  const store = await cookies();
  const adminToken = store.get(ADMIN_STASH_COOKIE)?.value;

  if (!adminToken) {
    store.delete(SESSION_COOKIE);
    return { restored: false };
  }

  store.set(
    SESSION_COOKIE,
    adminToken,
    flags(new Date(Date.now() + 12 * 3_600_000)),
  );
  store.delete(ADMIN_STASH_COOKIE);
  return { restored: true };
}

/** Kabuk "geçişten çık" düğmesini göstermeli mi — saklanmış oturum var mı. */
export async function hasStashedAdminSession(): Promise<boolean> {
  return Boolean((await cookies()).get(ADMIN_STASH_COOKIE)?.value);
}
