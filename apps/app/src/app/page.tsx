import { redirect } from "next/navigation";

import { hasSessionCookie } from "@/lib/context";

/**
 * Kök adres — oturuma göre panele ya da girişe yönlendirir.
 *
 * Çerezin **varlığına** bakmak burada yeterli: geçersiz çerezle panele giden
 * kullanıcı orada `requireContext()` üzerinden zaten girişe düşüyor. Yalnız
 * yönlendirme kararı için API'ye bir hop atmak her ziyaretçiye bedel
 * çıkarırdı.
 */
export default async function RootPage() {
  redirect((await hasSessionCookie()) ? "/panel" : "/giris");
}
