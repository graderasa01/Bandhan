import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getSubscriptionData } from "@/lib/data/subscriptionData";
import { getActiveSubscription } from "@/lib/services/payments/subscriptionService";
import { isTestGateway } from "@/lib/services/payments/gateway";
import { getBoostStatus } from "@/lib/services/boost/boostService";
import { getEntitlements } from "@/lib/services/plans/entitlements";
import { getPlanReelLimits } from "@/lib/services/plans/planService";
import { getMyMatchmakerRequests } from "@/lib/services/matchmaker/matchmakerService";
import { PLAN_FEATURES, PLAN_NAMES } from "@/lib/constants/plans";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import PlanCheckoutGrid from "@/components/subscription/PlanCheckoutGrid";
import PlanComparisonTable from "@/components/subscription/PlanComparisonTable";
import SubscriptionStatusPanel from "@/components/subscription/SubscriptionStatusPanel";
import BoostStatusCard from "@/components/subscription/BoostStatusCard";
import MatchmakerRequestCard from "@/components/subscription/MatchmakerRequestCard";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function SubscriptionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/subscription");

  const [subData, subscription, boost, entitlements, reelPerDay] = await Promise.all([
    getSubscriptionData(),
    getActiveSubscription(user.id),
    getBoostStatus(user.id),
    getEntitlements(user.id),
    getPlanReelLimits(),
  ]);
  const matchmakerRequests = entitlements.assistedMatchmaker ? await getMyMatchmakerRequests(user.id) : [];

  const planName = subscription ? PLAN_NAMES[subscription.planCode] : null;
  const status: "NONE" | "ACTIVE" | "CANCELLED" | "EXPIRED" = !subscription
    ? "NONE"
    : subscription.cancelledAt
      ? "CANCELLED"
      : "ACTIVE";

  // FREE is structurally ₹0 — planService refuses to price it otherwise.
  const prices: Record<string, string> = { FREE: "₹0" };
  for (const plan of subData.plans) prices[plan.id.toUpperCase()] = plan.price.display;

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">Subscription</h1>
          <p className="mt-2 text-sm text-muted">
            Apne liye best plan chunein. Partner referral se pehle mahine ka discount bhi mil sakta hai.
          </p>
          {isTestGateway() && (
            <p className="mt-2 inline-block rounded-full border border-warn/30 bg-warn-bg px-3 py-1 text-[0.75rem] font-medium text-warn">
              Test Mode — payments abhi dummy gateway se ho rahe hain
            </p>
          )}
        </section>

        <SubscriptionStatusPanel
          planName={planName}
          status={status}
          renewsOn={subscription ? formatDate(subscription.currentPeriodEnd) : undefined}
          autoRenew={subscription ? !subscription.cancelledAt : undefined}
        />

        <BoostStatusCard
          active={boost.active}
          activeUntil={boost.activeUntil}
          planHasBoost={subscription ? PLAN_FEATURES[subscription.planCode].boost : false}
        />

        {entitlements.assistedMatchmaker && <MatchmakerRequestCard requests={matchmakerRequests} />}

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-ink">Available plans</h2>
          {subData.plans.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="text-sm text-muted">Abhi koi plan available nahi hai.</p>
            </Card>
          ) : (
            <Suspense fallback={null}>
              <PlanCheckoutGrid
                plans={subData.plans}
                currentPlanCode={subscription?.planCode ?? null}
                isCurrentActive={status === "ACTIVE" || status === "CANCELLED"}
              />
            </Suspense>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-ink">Poori tulna</h2>
          <PlanComparisonTable prices={prices} reelPerDay={reelPerDay} />
        </section>

        <Card variant="soft" padding="md" className="mt-8">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
            <p className="text-xs leading-relaxed text-muted">
              {subData.paymentNote} Card details kabhi store nahi hoti. Plan kabhi bhi cancel kar sakte hain — cancel
              karne par bhi jitna period aapne liya hai, wo poora chalega.
            </p>
          </div>
        </Card>
      </div>
    </UserShell>
  );
}
