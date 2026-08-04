import type { SubscriptionViewModel, MessageLockedViewModel } from "@/lib/contracts/subscription";
import { makeMockMeta } from "@/lib/contracts/common";

export const mockSubscriptionData: SubscriptionViewModel = {
  meta: makeMockMeta("mock"),
  currentPlan: null, status: "NONE",
  // `plans` is always overwritten by lib/data/planData.ts's getPlanPreviews()
  // (real Prisma, D-10 monthly pricing) — see subscriptionData.ts.
  plans: [],
  cta: { label: "Subscribe Karein", actionId: "subscribe" },
  paymentNote: "Payment secure hai. Subscription payment success ke baad activate hogi.",
};

export const mockMessageLockedData: MessageLockedViewModel = {
  meta: makeMockMeta("mock"),
  reason: "Messages padhne ke liye subscription zaroori hai. Plans dekhein aur activate karein.",
  upgradeCTA: { label: "Plans Dekhein", href: "/user/subscription" },
};
