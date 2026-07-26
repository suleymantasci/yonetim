import { and, eq, isNull } from "drizzle-orm";

import { getDb, tenants } from "@yonetim/db";

/**
 * Public landing page verisi — yalnızca yayınlanmış siteler (Bölüm 6.14).
 * Kişisel veri döndürmez; RLS gerektirmeyen public alanlar okunur.
 */
export interface PublicTenant {
  slug: string;
  name: string;
  type: string;
  unitCount: number;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  addressLine: string | null;
  latitude: string | null;
  longitude: string | null;
}

export async function getPublicTenant(slug: string): Promise<PublicTenant | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const rows = await getDb()
      .select({
        slug: tenants.slug,
        name: tenants.name,
        type: tenants.type,
        unitCount: tenants.unitCount,
        city: tenants.city,
        district: tenants.district,
        neighborhood: tenants.neighborhood,
        addressLine: tenants.addressLine,
        latitude: tenants.latitude,
        longitude: tenants.longitude,
      })
      .from(tenants)
      .where(
        and(
          eq(tenants.slug, slug),
          eq(tenants.landingPublished, true),
          isNull(tenants.deletedAt),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  } catch (error) {
    console.error("[public-tenant] okuma hatası:", error);
    return null;
  }
}
