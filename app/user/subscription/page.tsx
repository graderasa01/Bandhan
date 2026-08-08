import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getSubscriptionData } from "@/lib/data/subscriptionData";
import { getActiveSubscription } from "@/lib/services/payments/subscriptionService";
import { isTestGateway } from "@/lib/services/payments/gateway";
import { getBoostStatus } from "@/lib/services/boost/boostService";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { getAllPlans } from "@/lib/services/plans/planService";
import { getMyMatchmakerRequests } from "@/lib/services/matchmaker/matchmakerService";
import { getPlanCatalog, planFeaturesOf, planNameOf } from "@/lib/services/plans/planCatalog";
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

  const [subData, subscription, boost, planCtx, allPlans, catalog] = await Promise.all([
    getSubscriptionData(),
    getActiveSubscription(user.id),
    getBoostStatus(user.id),
    getPlanContext(user.id),
    getAllPlans(),
    getPlanCatalog(),
  ]);
  const entitlements = planCtx.features;
  const matchmakerRequests = entitlements.assistedMatchmaker ? await getMyMatchmakerRequests(user.id) : [];

  // Effective plan, not just the billed one — an admin grant is a real reason
  // this user has Premium and the page used to show none of it. GRANTED is its
  // own status rather than ACTIVE: nothing was paid and there is no renewal.
  const granted = planCtx.planSource === "ADMIN_GRANT";
  const planName = granted
    ? planNameOf(catalog, planCtx.effectivePlanCode)
    : subscription
      ? planNameOf(catalog, subscription.planCode)
      : null;
  const status: "NONE" | "ACTIVE" | "CANCELLED" | "EXPIRED" | "GRANTED" = granted
    ? "GRANTED"
    : !subscription
      ? "NONE"
      : subscription.cancelledAt
        ? "CANCELLED"
        : "ACTIVE";

  // Every purchasable plan, straight from the catalog — the comparison table
  // is N-column now, so an admin-created tier appears here without a code change.
  const comparisonPlans = allPlans
    .filter((p) => p.isActive && p.isPublic)
    .map((p) => ({
      code: p.code,
      name: p.name,
      price: '₹' + (p.priceInPaise / 100).toLocaleString('en-IN'),
      features: p.features,
    }));

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
          renewsOn={
            granted
              ? planCtx.grantExpiresAt
                ? formatDate(planCtx.grantExpiresAt)
                : undefined
              : subscription
                ? formatDate(subscription.currentPeriodEnd)
                : undefined
          }
          // A grant never auto-renews, so this reads "Access <date> tak rahega".
          autoRenew={granted ? false : subscription ? !subscription.cancelledAt : undefined}
        />

        <BoostStatusCard
          active={boost.active}
          activeUntil={boost.activeUntil}
          // Effective plan: a granted Premium really does include boost.
          planHasBoost={planFeaturesOf(catalog, planCtx.effectivePlanCode).boost}
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
                // The granted plan is marked "current" too — offering someone a
                // Buy button for the plan they are already using is confusing,
                // even though they never paid for it.
                currentPlanCode={granted ? planCtx.effectivePlanCode : (subscription?.planCode ?? null)}
                isCurrentActive={status === "ACTIVE" || status === "CANCELLED" || status === "GRANTED"}
              />
            </Suspense>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-ink">Poori tulna</h2>
          <PlanComparisonTable plans={comparisonPlans} />
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
