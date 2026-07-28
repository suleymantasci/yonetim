import type { CampaignTemplate } from "@yonetim/campaigns";

/**
 * Kampanya ödülünün okunabilir karşılığı.
 *
 * Liste ve detay sayfası aynı metni gösteriyor; iki yerde ayrı `switch`
 * yazmak, bir ödül tipi eklendiğinde birinin sessizce eksik kalması demekti.
 */
export function rewardLabel(
  template: CampaignTemplate,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const reward = template.reward;
  const base = (() => {
    switch (reward.type) {
      case "free_months":
        return t("reward.freeMonths", { count: reward.value });
      case "percent_off":
        return t("reward.percentOff", { value: reward.value });
      case "amount_off":
        return t("reward.amountOff", { value: reward.value });
      case "free_period":
        return reward.value === 1
          ? t("reward.freeFirstYear")
          : t("reward.freeYears", { count: reward.value });
      case "credit_balance":
        return t("reward.creditBalance", { value: reward.value });
      default:
        return "";
    }
  })();
  return reward.lifetime ? `${base} ${t("reward.lifetime")}` : base;
}

/** Kampanya sayfa yolundaki dilim — `key` alt çizgili, URL tireli. */
export const campaignSlug = (key: string) => key.replace(/_/g, "-");
