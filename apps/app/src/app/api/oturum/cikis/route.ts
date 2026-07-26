import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { destroySession, SESSION_COOKIE } from "@yonetim/auth";

export async function POST(request: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  store.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/giris", request.url), { status: 303 });
}
