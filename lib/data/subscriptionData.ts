// M01 UI-only subscription provider.
// Future M09 Subscription module should replace this mock source
// with real billing/payment/entitlement service data,
// keeping the same typed ViewModel contracts so UI pages don't change.
// Plan pricing itself is already real (lib/data/planData.ts) — only the
// checkout/payment/entitlement parts are still mock.
import { getDataMode } from "./dataMode";
import type { SubscriptionViewModel, MessageLockedViewModel } from "@/lib/contracts/subscription";
import { mockSubscriptionData, mockMessageLockedData } from "@/lib/mock/subscriptionMock";
import { getPlanPreviews } from "./planData";

export async function getSubscriptionData(): Promise<SubscriptionViewModel> {
  if (getDataMode() !== "mock") throw new Error("API data mode is not implemented during M01 UI phase.");
  return { ...mockSubscriptionData, plans: await getPlanPreviews() };
}
export async function getMessageLockedData(): Promise<MessageLockedViewModel> { return getDataMode() === "mock" ? mockMessageLockedData : (() => { throw new Error("API data mode is not implemented during M01 UI phase."); })(); }
