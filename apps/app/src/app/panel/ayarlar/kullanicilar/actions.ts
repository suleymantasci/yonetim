"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { TEAM_ROLES } from "@yonetim/contracts";

import { apiDelete, apiPatch, apiPost } from "@/lib/api/server";
import { requirePermission } from "@/lib/context";
import {
  okState,
  optionalText,
  reasonMessage,
  requiredText,
  runAction,
  V,
  type ActionState,
} from "@/lib/form";

const inviteSchema = z
  .object({
    firstName: requiredText(1, 80),
    lastName: requiredText(1, 80),
    phone: optionalText(30),
    email: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() || undefined : v),
      z.string().email(V.invalidEmail).optional(),
    ),
    role: z.enum(TEAM_ROLES, { errorMap: () => ({ message: V.invalidSelection }) }),
  })
  .refine((d) => !!d.phone || !!d.email, { message: V.required, path: ["phone"] });

export async function inviteMember(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(
    { permission: "settings:write", schema: inviteSchema, meta: { action: "team_invite", resource: "membership" } },
    formData,
    async ({ input }) => {
      const t = await getTranslations("app.team");
      const result = await apiPost(
        "/v1/panel/team",
        {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone ?? null,
          email: input.email ?? null,
          role: input.role,
        },
        z.object({ membershipId: z.string().uuid(), linkedExisting: z.boolean() }),
      );
      return okState(result.linkedExisting ? t("invitedExisting") : t("invited"));
    },
  );
}

export async function changeMemberRole(
  membershipId: string,
  role: (typeof TEAM_ROLES)[number],
): Promise<{ ok: boolean; message: string }> {
  await requirePermission("settings:write");
  const t = await getTranslations("app.team");
  try {
    await apiPatch(`/v1/panel/team/${membershipId}`, { role }, z.object({ membershipId: z.string().uuid() }));
    return { ok: true, message: t("roleChanged") };
  } catch (error) {
    const reason = await reasonMessage(error);
    if (reason) return { ok: false, message: reason };
    throw error;
  }
}

export async function removeMember(membershipId: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("settings:write");
  const t = await getTranslations("app.team");
  try {
    await apiDelete(`/v1/panel/team/${membershipId}`);
    return { ok: true, message: t("removed") };
  } catch (error) {
    const reason = await reasonMessage(error);
    if (reason) return { ok: false, message: reason };
    throw error;
  }
}
