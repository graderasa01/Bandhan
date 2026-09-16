import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BadgeCheck, Lock, MessageCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getSubscriptionData } from "@/lib/data/subscriptionData";
import { getChatUnlockOffer, getFreeList } from "@/lib/data/planData";
import { getActiveSubscription } from "@/lib/services/payments/subscriptionService";
import { isTestGateway } from "@/lib/services/payments/gateway";
import { getBoostStatus } from "@/lib/services/boost/boostService";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { getAllPlans } from "@/lib/services/plans/planService";
import { getMyMatchmakerRequests } from "@/lib/services/matchmaker/matchmakerService";
import { getPlanCatalog, planFeaturesOf, planNameOf } from "@/lib/services/plans/planCatalog";
import { availableChatUnlockCredits } from "@/lib/services/chat/chatUnlockService";
import { listItemOffers } from "@/lib/services/items/itemPurchaseService";
import { itemPromiseLine } from "@/lib/constants/serviceItems";
import { getT } from "@/lib/i18n/server";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import PlanCheckoutGrid from "@/components/subscription/PlanCheckoutGrid";
import PlanComparisonTable from "@/components/subscription/PlanComparisonTable";
import SubscriptionStatusPanel from "@/components/subscription/SubscriptionStatusPanel";
import BoostStatusCard from "@/components/subscription/BoostStatusCard";
import MatchmakerRequestCard from "@/components/subscription/MatchmakerRequestCard";
import ServiceItemGrid from "@/components/subscription/ServiceItemGrid";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * D-90 — the member's side of "paisa sahi pal par": what is free, the two
 * places money is asked for (a Chat Unlock, the Rishta Pass), and — only when
 * there is one — the plan they already have, with its end date.
 *
 * Same shape as /pricing on purpose, so the promise a visitor read is the page
 * a member lands on.
 */
export default async function SubscriptionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/subscription");
  const t = await getT();

  const [subData, subscription, boost, planCtx, allPlans, catalog, freeList, unlockOffer, credits] =
    await Promise.all([
      getSubscriptionData(),
      getActiveSubscription(user.id),
      getBoostStatus(user.id),
      getPlanContext(user.id),
      getAllPlans(t),
      getPlanCatalog(),
      getFreeList(t),
      getChatUnlockOffer(),
      availableChatUnlockCredits(user.id),
    ]);
  const entitlements = planCtx.features;

  // The plan's own feature set, with no overrides or reward credits folded
  // in. "Is this in my plan" and "can I use this right now" are different
  // questions, and only the first decides whether buying an item is pointless.
  const planBaseline = planFeaturesOf(catalog, planCtx.effectivePlanCode);
  const itemOffers = await listItemOffers(planBaseline, t);
  const matchmakerRequests = entitlements.assistedMatchmaker ? await getMyMatchmakerRequests(user.id) : [];

  // Effective plan, not just the billed one — an admin grant is a real reason
  // this user has a plan. GRANTED is its own status: nothing was paid.
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
  const endsOn = granted
    ? planCtx.grantExpiresAt
      ? formatDate(planCtx.grantExpiresAt)
      : undefined
    : subscription
      ? formatDate(subscription.currentPeriodEnd)
      : undefined;

  // FREE beside every plan on sale — the same columns /pricing shows. FREE is
  // never `isPublic` (it is not a thing to buy), so it is named, not filtered in.
  const comparisonPlans = allPlans
    .filter((p) => p.code === "FREE" || (p.isActive && p.isPublic))
    .map((p) => ({
      code: p.code,
      name: p.name,
      price: "₹" + (p.priceInPaise / 100).toLocaleString("en-IN"),
      features: p.features,
    }));

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <section className="mb-6">
          <h1 className="text-2xl font-bold text-wine-700">
            {t("userPages.subscription.title", "Pass aur Unlock")}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {t(
              "userPages.subscription.subtitle",
              "Rishta dhoondhna free hai. Paisa sirf do jagah lagta hai — ek rishte ki chat kholne par, ya mahine bhar ke Pass par.",
            )}
          </p>
          {isTestGateway() && (
            <p className="mt-2 inline-block rounded-full border border-warn/30 bg-warn-bg px-3 py-1 text-[0.75rem] font-medium text-warn">
              {t("userPages.subscription.testMode", "Test Mode — payments abhi dummy gateway se ho rahe hain")}
            </p>
          )}
        </section>

        {/* Only a member who has a plan gets a status card — on FREE the
            "Hamesha free" list below already says everything it would. */}
        {status !== "NONE" && <SubscriptionStatusPanel planName={planName} status={status} endsOn={endsOn} />}

        {entitlements.assistedMatchmaker && <MatchmakerRequestCard requests={matchmakerRequests} />}

        {/* Boost is never sold, so this card only appears when there is
            something to report: a boost running now, or an old plan that
            includes one. */}
        {(boost.active || planBaseline.boost) && (
          <BoostStatusCard active={boost.active} activeUntil={boost.activeUntil} planHasBoost={planBaseline.boost} />
        )}

        {freeList.length > 0 && (
          <Card variant="soft" padding="lg" className="mt-6">
            <p className="text-[0.9375rem] font-semibold text-ink">
              {t("userPages.subscription.freeTitle", "Hamesha free")}
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {freeList.map((line) => (
                <li key={line} className="flex items-start gap-2 text-[0.8125rem] text-ink">
                  <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-trust" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-ink">
            {t("userPages.subscription.unlockTitle", "Chat Unlock")}
          </h2>
          <Card padding="lg">
            {entitlements.chat ? (
              <p className="flex items-start gap-2 text-sm text-ink">
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
                {t(
                  "userPages.subscription.unlockCovered",
                  "Aapke plan me har match ki chat khuli hai — alag unlock ki zaroorat nahi.",
                )}
              </p>
            ) : (
              <>
                {unlockOffer && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-[family-name:var(--font-display)] text-3xl leading-none text-ink">
                      {unlockOffer.priceDisplay}
                    </span>
                    <span className="text-[0.875rem] text-muted">
                      {t("userPages.subscription.unlockPer", "/ ek rishta")}
                    </span>
                  </div>
                )}
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {t(
                    "userPages.subscription.unlockBody",
                    "Mutual match hone par usi chat me kholein. Ek unlock me chat aap dono ke liye khulti hai.",
                  )}
                </p>
                {unlockOffer && (
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {t(
                      "userPages.subscription.unlockRefund",
                      "Aapne likha, par {hours} ghante me jawab nahi aaya — to unlock wapas ({days} din me {cap} baar tak).",
                    )
                      .replace("{hours}", String(unlockOffer.guaranteeHours))
                      .replace("{days}", String(unlockOffer.refundWindowDays))
                      .replace("{cap}", String(unlockOffer.refundCap))}
                  </p>
                )}
                {credits > 0 && (
                  <p className="mt-3 rounded-lg bg-trust-bg px-3 py-2 text-sm font-medium text-trust">
                    {t(
                      "userPages.subscription.unlockCredits",
                      "Aapke paas {n} free unlock hai — kisi bhi match ki chat me use karein.",
                    ).replace("{n}", String(credits))}
                  </p>
                )}
              </>
            )}
            <Link
              href="/user/messages"
              className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary-text underline underline-offset-2"
            >
              {t("userPages.subscription.goToMessages", "Go to Messages")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Card>
        </section>

        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold text-ink">
            {t("userPages.subscription.passTitle", "Mahine bhar ka Pass")}
          </h2>
          <p className="mb-4 text-[0.8125rem] text-muted">
            {t(
              "userPages.subscription.passSubtitle",
              "Jab ek saath kai rishton se baat chal rahi ho. Apne aap renew nahi hota.",
            )}
          </p>
          {subData.plans.length === 0 ? (
            <Card variant="soft" padding="lg" className="text-center">
              <p className="text-sm text-muted">
                {t("userPages.subscription.noPlans", "Abhi koi plan available nahi hai.")}
              </p>
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

        {itemOffers.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-1 text-lg font-semibold text-ink">
              {t("userPages.subscription.itemsTitle", "Ek baar ki cheezein")}
            </h2>
            <p className="mb-4 text-[0.8125rem] text-muted">
              {t(
                "userPages.subscription.itemsSubtitle",
                "Poora plan nahi chahiye? Sirf jo cheez chahiye, wo alag se lein — koi monthly bill nahi.",
              )}
            </p>
            <ServiceItemGrid
              items={itemOffers.map(({ item, availability }) => ({
                code: item.code,
                name: item.name,
                description: item.description,
                price: "₹" + (item.priceInPaise / 100).toLocaleString("en-IN"),
                promise: itemPromiseLine(item.kind, item.config),
                buyable: availability.buyable,
                blockedReason: availability.reason,
              }))}
            />
          </section>
        )}

        {comparisonPlans.length > 1 && (
          <section className="mt-8">
            <h2 className="mb-4 text-lg font-semibold text-ink">
              {t("userPages.subscription.fullComparison", "Poori tulna")}
            </h2>
            <PlanComparisonTable plans={comparisonPlans} recommendedCode="PASS" />
          </section>
        )}

        <Card variant="soft" padding="md" className="mt-8">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-trust" aria-hidden />
            <p className="text-xs leading-relaxed text-muted">
              {subData.paymentNote}{" "}
              {t(
                "userPages.subscription.paymentNote",
                "Card details kabhi store nahi hoti. Kuch bhi apne aap renew nahi hota — bina aapke kahe paisa nahi katega.",
              )}
            </p>
          </div>
        </Card>
      </div>
    </UserShell>
  );
}
