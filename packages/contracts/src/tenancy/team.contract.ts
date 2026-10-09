import { z } from "zod";

import { dateTime, uuid } from "../_shared/fields";

/**
 * Program kullanıcıları — sitenin panel ekibi (ikinci yönetici, muhasebeci,
 * denetçi, personel). Sakinler (malik/kiracı) burada değil, Sakinler ekranında.
 *
 * Davet: kişi telefon ya da e-postasıyla kodla giriş yapar; parola şartı yok.
 * Aynı telefon/e-posta başka sitede kayıtlıysa yeni kişi açılmaz, bağlanır.
 */
export const TEAM_ROLES = ["manager", "accountant", "auditor", "staff"] as const;
export const teamRole = z.enum(TEAM_ROLES);

export const teamMember = z.object({
  membershipId: uuid,
  userId: uuid,
  name: z.string(),
  role: z.string(),
  /** Bu ekrandan değiştirilebilir mi (şirket rolleri ve kişinin kendisi değil). */
  editable: z.boolean(),
  isSelf: z.boolean(),
  phoneMasked: z.string().nullable(),
  email: z.string().nullable(),
  invitedAt: dateTime.nullable(),
  lastLoginAt: dateTime.nullable(),
});

export const teamList = z.object({ rows: z.array(teamMember) });
export type TeamList = z.infer<typeof teamList>;

export const teamInvite = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(30).nullish(),
    email: z.string().trim().email().max(200).nullish(),
    role: teamRole,
  })
  .refine((d) => !!d.phone || !!d.email, { message: "contact_required", path: ["phone"] });

export type TeamInvite = z.infer<typeof teamInvite>;

export const teamRolePatch = z.object({ role: teamRole });
export type TeamRolePatch = z.infer<typeof teamRolePatch>;
