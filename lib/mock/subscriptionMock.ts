import type { SubscriptionViewModel, MessageLockedViewModel } from "@/lib/contracts/subscription";
import { makeMockMeta } from "@/lib/contracts/common";

export const mockSubscriptionData: SubscriptionViewModel = {
  meta: makeMockMeta("mock"),
  currentPlan: null, status: "NONE",
  // `plans` is always overwritten by lib/data/planData.ts's getPlanPreviews()
  // (real Prisma — since D-90, the Rishta Pass) — see subscriptionData.ts.
  plans: [],
  cta: { label: "Get Rishta Pass", actionId: "subscribe" },
  paymentNote: "Payment secure gateway se hota hai.",
};

export const mockMessageLockedData: MessageLockedViewModel = {
  meta: makeMockMeta("mock"),
  reason: "Ye chat abhi band hai — ek Chat Unlock se aap dono ke liye khul jayegi, ya Rishta Pass se sab chats.",
  upgradeCTA: { label: "Go to Messages", href: "/user/messages" },
};
