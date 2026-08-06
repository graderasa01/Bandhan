// The real subscription page (app/user/subscription/page.tsx) only ever reads
// `plans` and `paymentNote` off this — current plan/status/cta come straight
// from lib/services/payments/subscriptionService.ts instead. `plans` is real
// Prisma data (lib/data/planData.ts) regardless of NEXT_PUBLIC_DATA_MODE, so
// nothing here is actually mock-only anymore; the mode-gated throw was a
// leftover from the M01 UI-only phase and broke this page in production
// (NEXT_PUBLIC_DATA_MODE=api there, as it should be).
import type { SubscriptionViewModel, MessageLockedViewModel } from "@/lib/contracts/subscription";
import { mockSubscriptionData, mockMessageLockedData } from "@/lib/mock/subscriptionMock";
import { getPlanPreviews } from "./planData";

export async function getSubscriptionData(): Promise<SubscriptionViewModel> {
  return { ...mockSubscriptionData, plans: await getPlanPreviews() };
}
export async function getMessageLockedData(): Promise<MessageLockedViewModel> { return mockMessageLockedData; }
