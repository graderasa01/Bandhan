/** M01X — Subscription contracts */
import type { MockMeta, UIAction } from "./common";
import type { PlanPreviewViewModel } from "./publicPages";

export type SubscriptionViewModel = {
  meta: MockMeta; currentPlan: string | null; status: "NONE" | "ACTIVE" | "EXPIRED";
  plans: PlanPreviewViewModel[]; cta: UIAction; paymentNote: string;
};

export type MessageLockedViewModel = { meta: MockMeta; reason: string; upgradeCTA: UIAction };
