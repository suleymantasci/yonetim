import { siteConfig } from "@yonetim/config";
import { daysBetween } from "@yonetim/core";

/**
 * Dunning (ödeme hatırlatma) akışı — SPEC Bölüm 15.3.
 * 1. gün e-posta, 3. gün SMS, 7. gün e-posta + uygulama içi,
 * 14. gün salt-okunur askı, 30. gün arşiv.
 */
export type DunningAction = "email" | "sms" | "email_and_in_app" | "suspend_read_only" | "archive";

export interface DunningStep {
  day: number;
  action: DunningAction;
}

/**
 * Adım metinleri i18n katmanındadır: `notification.email.dunning.*`.
 * Bu modül yalnızca hangi günde hangi aksiyonun alınacağını bilir.
 */
export function dunningPlan(): DunningStep[] {
  return siteConfig.billing.dunningSteps.map((s) => ({
    day: s.day,
    action: s.action as DunningAction,
  }));
}

export interface DunningDecision {
  step: DunningStep | null;
  stepIndex: number;
  daysSinceFailure: number;
  shouldSuspend: boolean;
  shouldArchive: boolean;
}

export function evaluateDunning(params: {
  firstFailureAt: Date;
  lastStepIndex: number;
  now?: Date;
}): DunningDecision {
  const now = params.now ?? new Date();
  const days = daysBetween(params.firstFailureAt, now);
  const plan = dunningPlan();

  let targetIndex = -1;
  for (let i = 0; i < plan.length; i++) {
    if (days >= plan[i]!.day) targetIndex = i;
  }

  if (targetIndex < 0 || targetIndex <= params.lastStepIndex - 1) {
    return {
      step: null,
      stepIndex: params.lastStepIndex,
      daysSinceFailure: days,
      shouldSuspend: false,
      shouldArchive: false,
    };
  }

  const step = plan[targetIndex]!;
  return {
    step,
    stepIndex: targetIndex + 1,
    daysSinceFailure: days,
    shouldSuspend: step.action === "suspend_read_only",
    shouldArchive: step.action === "archive",
  };
}

/**
 * Deneme süresi bitiş kararı — Bölüm 2.3.
 * Bitince otomatik askı; veri 6 ay bekletilir, sonra arşiv.
 * `messageKey` → `notification.trial.<key>` (metin i18n katmanında).
 */
export function evaluateTrial(params: {
  trialEndsAt: Date;
  now?: Date;
}): {
  expired: boolean;
  daysOver: number;
  shouldArchive: boolean;
  messageKey: "upcoming" | "suspended" | "archived";
  retentionMonths: number;
} {
  const now = params.now ?? new Date();
  const daysOver = daysBetween(params.trialEndsAt, now);
  const retentionDays = siteConfig.billing.trial.dataRetentionMonthsAfterTrial * 30;

  const retentionMonths = siteConfig.billing.trial.dataRetentionMonthsAfterTrial;

  if (daysOver < 0) {
    return { expired: false, daysOver, shouldArchive: false, messageKey: "upcoming", retentionMonths };
  }
  if (daysOver >= retentionDays) {
    return { expired: true, daysOver, shouldArchive: true, messageKey: "archived", retentionMonths };
  }
  return { expired: true, daysOver, shouldArchive: false, messageKey: "suspended", retentionMonths };
}
