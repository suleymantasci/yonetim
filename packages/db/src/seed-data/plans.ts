import { ALL_PLANS, type PlanDefinition } from "@yonetim/pricing";

/** Plan kataloğu tek kaynaktan gelir (packages/pricing) — DB seed sadece yansıtır. */
export const PLAN_SEED: PlanDefinition[] = ALL_PLANS;
