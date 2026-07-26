import { and, eq, isNull } from "drizzle-orm";

import { siteConfig } from "@yonetim/config";
import { addDays, daysBetween } from "@yonetim/core";
import { maintenanceRecords, withTenant } from "@yonetim/db";

/**
 * Periyodik bakım hatırlatmaları — SPEC Bölüm 3.7.
 * T-30, T-15, T-7, T-0, T+3 günlerinde bildirim üretilir.
 */
export interface MaintenanceReminder {
  recordId: string;
  label: string;
  equipmentType: string;
  nextDueAt: Date;
  daysRemaining: number;
  overdue: boolean;
  /**
   * Metin i18n katmanındadır: `app.maintenance.reminder.<messageKey>`.
   * Parametreler: `label`, `days`, `date`.
   */
  messageKey: "overdue" | "today" | "upcoming";
}

export async function collectMaintenanceReminders(params: {
  tenantId: string;
  now?: Date;
}): Promise<MaintenanceReminder[]> {
  const now = params.now ?? new Date();
  const triggerDays: readonly number[] = siteConfig.notifications.maintenanceReminderDays;

  return withTenant(params.tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(maintenanceRecords)
      .where(and(eq(maintenanceRecords.isActive, true), isNull(maintenanceRecords.deletedAt)));

    const reminders: MaintenanceReminder[] = [];
    for (const r of rows) {
      const remaining = daysBetween(now, r.nextDueAt);
      if (!triggerDays.includes(remaining)) continue;
      const overdue = remaining < 0;
      reminders.push({
        recordId: r.id,
        label: r.label,
        equipmentType: r.equipmentType,
        nextDueAt: r.nextDueAt,
        daysRemaining: remaining,
        overdue,
        messageKey: overdue ? "overdue" : remaining === 0 ? "today" : "upcoming",
      });
    }
    return reminders;
  });
}

/** Bakım tamamlandığında bir sonraki tarihi otomatik hesaplar (Bölüm 3.7). */
export async function completeMaintenance(params: {
  tenantId: string;
  recordId: string;
  completedAt?: Date;
  costKurus?: number;
  documentUrl?: string;
  checklistResult?: Record<string, boolean>;
  userId?: string;
}): Promise<{ nextDueAt: Date }> {
  const completedAt = params.completedAt ?? new Date();

  return withTenant(
    params.tenantId,
    async (tx) => {
      const rows = await tx
        .select()
        .from(maintenanceRecords)
        .where(eq(maintenanceRecords.id, params.recordId))
        .limit(1);
      const record = rows[0];
      if (!record) throw new Error("Bakım kaydı bulunamadı.");

      const nextDueAt = addDays(completedAt, record.intervalDays);
      await tx
        .update(maintenanceRecords)
        .set({
          lastDoneAt: completedAt,
          nextDueAt,
          lastCostKurus: params.costKurus ?? record.lastCostKurus,
          documentUrl: params.documentUrl ?? record.documentUrl,
          checklistResult: params.checklistResult ?? record.checklistResult,
        })
        .where(eq(maintenanceRecords.id, params.recordId));

      return { nextDueAt };
    },
    { userId: params.userId },
  );
}
