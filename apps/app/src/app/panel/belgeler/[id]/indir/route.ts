import { NextResponse } from "next/server";

import { documentDownloadResult } from "@yonetim/contracts";

import { apiGet } from "@/lib/api/server";

/**
 * `document:<id>` eklerinin bağlantısı — imzalı indirme adresine yönlendirir.
 * Yetki ve site kontrolü API'de (`document:read`, RLS); adres dakikalar
 * içinde ölüyor, bu yüzden sayfaya gömülmüyor, her tıklamada üretiliyor.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  try {
    const { url } = await apiGet(`/v1/panel/documents/${id}/download`, documentDownloadResult);
    return NextResponse.redirect(url, { status: 302 });
  } catch {
    return NextResponse.redirect(new URL("/panel/belgeler", request.url), { status: 302 });
  }
}
