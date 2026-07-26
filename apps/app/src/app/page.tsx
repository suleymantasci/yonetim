import { redirect } from "next/navigation";

import { getSession } from "@/lib/context";

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? "/panel" : "/giris");
}
