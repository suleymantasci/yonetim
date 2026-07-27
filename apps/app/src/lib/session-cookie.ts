import { cookies } from "next/headers";

import { SESSION_COOKIE } from "@yonetim/auth/cookie";

/**
 * Oturum çerezini tarayıcıya yazar.
 *
 * Jetonu `apps/api` üretiyor (oturum kaydının sahibi orası); çerezi burası
 * yazıyor çünkü tarayıcı yalnız bu origin'i görüyor. Bölünme bilinçli:
 * render katmanına verilen şey bir yetki değil, taşınacak bir dize.
 *
 * Bayrakların tek yerde olması şart — `HttpOnly` bir yerde unutulursa oturum
 * jetonu JavaScript'e açılır ve bunu fark etmek zordur.
 */
export async function setSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
