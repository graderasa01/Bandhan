import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Rocket, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getBoostStatus } from "@/lib/services/boost/boostService";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { PLAN_FEATURES } from "@/lib/constants/plans";
import { getActiveQuests } from "@/lib/services/quests/questService";
import { scoreRecentActivity, BOOST_MULTIPLIER } from "@/lib/services/match/pipeline";
import UserShell from "@/components/layout/UserShell";
import Card from "@/components/ui/Card";
import BoostHero from "@/components/boost/BoostHero";
import BoostScoreCompare from "@/components/boost/BoostScoreCompare";
import BoostEarnCard from "@/components/boost/BoostEarnCard";

/**
 * "Profile Boost" as its own service page rather than two lines buried in
 * /user/subscription — doc 11's framing: showcase what the platform already
 * sells, with a manual (credit-spent) activation path alongside the
 * subscription's automatic one. See `docs/bandhantak/10_engagement_and_
 * monetization_architecture.md` §3.6 for the pipeline guardrail this page's
 * copy is written to respect: boost is a bounded +15% nudge, never an
 * override, and this page says exactly that rather than overselling it.
 */
export default async function BoostPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/user/boost");

  const [boost, planCtx, quests, profile] = await Promise.all([
    getBoostStatus(user.id),
    getPlanContext(user.id),
    getActiveQuests(user.id),
    prisma.profile.findUnique({ where: { userId: user.id }, select: { updatedAt: true } }),
  ]);

  const boostQuestView = quests.find((q) => q.key === "boost_voice_notes") ?? null;

  // `planCtx.features.boost` is deliberately *not* this: `getPlanContext`
  // also flips it true whenever the user merely holds a live BOOST credit
  // (entitlements.ts's "am I boosted right now" convenience), which is
  // exactly the state this page needs to tell apart from "the plan itself
  // includes it" — otherwise a user who just earned a credit would see
  // "already included, nothing to do" and never find the Activate button.
  const planHasBoost = PLAN_FEATURES[planCtx.effectivePlanCode].boost;

  // The real formula, forced to its un-boosted form so "bina boost" always
  // reads as the honest baseline even while a boost is currently active.
  const baseScore = profile ? scoreRecentActivity({ updatedAt: profile.updatedAt, boostActiveUntil: null }) : null;
  const boostedScore = baseScore === null ? null : Math.min(100, Math.round(baseScore * BOOST_MULTIPLIER));

  return (
    <UserShell userName={user.fullName}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-primary-fg shadow-gold">
            <Rocket className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-wine-700">
                Profile Boost
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-gold-300/60 bg-gold-50 px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-gold-700 dark:border-gold-700/40 dark:bg-gold-900/30 dark:text-gold-200">
                <Sparkles className="size-3" />
                BandhanTak Service
              </span>
            </div>
            <p className="mt-1.5 text-base text-muted">
              24 ghante ke liye aapki profile dusron ke Rishta Reel me thodi upar dikhti hai.
            </p>
          </div>
        </header>

        <Card variant="luxe" padding="lg" className="spotlight overflow-hidden">
          <div className="relative">
            <BoostHero active={boost.active} activeUntil={boost.activeUntil} planHasBoost={planHasBoost} />
          </div>
        </Card>

        {baseScore !== null && boostedScore !== null && (
          <Card variant="soft" padding="lg" className="mt-4">
            <BoostScoreCompare base={baseScore} boosted={boostedScore} />
          </Card>
        )}

        <div className="mt-4">
          <BoostEarnCard
            planHasBoost={planHasBoost}
            credits={planCtx.credits.BOOST}
            quest={boostQuestView}
          />
        </div>

        <Card variant="soft" padding="lg" className="mt-4">
          <p className="text-[0.9375rem] font-semibold text-ink">Ye service kya deti hai</p>
          <ul className="mt-3 space-y-2.5">
            <li className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-muted">
              <Zap className="mt-0.5 size-4 shrink-0 text-gold-700" />
              Reel ranking ke recency signal par bounded +15% (max 100) — 24 ghante ke liye.
            </li>
            <li className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-trust" />
              Match-fit aur trust score kabhi overtake nahi hote — boost sirf ek chhota nudge hai, jhoothi
              guarantee nahi.
            </li>
            <li className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-muted">
              <Rocket className="mt-0.5 size-4 shrink-0 text-gold-700" />
              Kamaayein (aaj ka voice quest) ya Standard/Premium plan se hamesha ke liye paayein.
            </li>
          </ul>

          <Link
            href="/user/subscription"
            className="mt-4 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-gold-700 transition-colors hover:text-gold-800"
          >
            Standard ya Premium dekhein
            <ArrowRight className="size-3.5" />
          </Link>
        </Card>
      </div>
    </UserShell>
  );
}
