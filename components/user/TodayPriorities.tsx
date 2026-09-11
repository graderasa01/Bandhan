import Link from "next/link";
import { ArrowRight, AlertTriangle, Clock, MessageCircle, Film, HelpCircle, ShieldCheck, Target } from "lucide-react";
import { Sparkle } from "@/components/public/_shared/Ornaments";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import type { PriorityTier, TodayPriority } from "@/lib/services/today/priorityEngine";

/**
 * The top of the dashboard: what to do next, in the order code decided.
 *
 * ## Why this sits above everything else
 *
 * Every other card on this page is scoped to one feature and therefore argues
 * for itself — the reel card says open the reel, the trust card says verify
 * your phone, the intelligence card says answer a question. None of them can
 * say "that one matters more than this one", because none of them can see the
 * others. This block is the only thing on the page that has read all of them,
 * so it goes first, and the rest become the detail behind it rather than nine
 * competing openings.
 *
 * ## Three, and no scroll
 *
 * `TOP_PRIORITIES` is 3 because a list long enough to hold everything has
 * stopped prioritising, and the failure mode of "show them all, ranked" is that
 * the user reads the first two and feels behind on seven. There is deliberately
 * no "see all" — the remaining items are still reachable through the pages they
 * belong to, which is where they make sense anyway.
 *
 * ## Nothing here is generated
 *
 * Titles and detail lines come from `priorityEngine.ts` as literal strings. A
 * model never writes into this component, which is the same rule `briefing.ts`
 * follows for the spoken greeting and for the same reason: this is the one
 * surface nobody reads sceptically.
 */

/**
 * Per tier, not per item. An icon that changes with the *kind* of urgency is
 * something the eye learns in a week; one chosen per row is decoration.
 */
const TIER_ICON: Record<PriorityTier, typeof ArrowRight> = {
  P0_URGENT: AlertTriangle,
  P1_WAITING_ON_ME: MessageCircle,
  P2_TIME_BOUND: Clock,
  P3_ACTIVE_RISHTA: MessageCircle,
  P4_TODAY_REEL: Film,
  P5_INTELLIGENCE_GAP: HelpCircle,
  P6_TRUST: ShieldCheck,
  P7_PROGRESS: Target,
  P8_UPGRADE: ArrowRight,
};

/**
 * Only P0 is coloured. Urgency spent on more than one tier is urgency spent on
 * nothing — if three rows are red the user learns that red means "a row".
 * Everything else sits in the page's own gold hairline ring.
 */
function ringFor(tier: PriorityTier) {
  return tier === "P0_URGENT" ? "bt-ring--danger" : undefined;
}

export default async function TodayPriorities({ priorities }: { priorities: TodayPriority[] }) {
  // Genuinely nothing waiting is a real state and a good one. Rendering an
  // empty heading would invent a chore where the honest answer is "you're
  // clear" — and the reel card below already offers the next thing to do.
  if (priorities.length === 0) return null;

  const t = await getT();

  return (
    <section aria-label={t("today.sectionAria", "Aaj sabse zaroori")}>
      <h2 className="bt-section-label mb-2.5">
        <Sparkle />
        {t("today.sectionTitle", "Aaj ke liye")}
      </h2>

      {/* One card, hairlines between rows — an itinerary, not a stack of
          boxes. The row's own CTA is a chip that turns gold under the hand
          (see `.bt-row:hover .bt-chip`), so the whole row reads as the
          button it is without every chip on the page being gold at rest. */}
      <div className="bt-card overflow-hidden">
        <ul className="bt-rows">
          {priorities.map((p) => {
            const Icon = TIER_ICON[p.tier];
            return (
              <li key={p.key}>
                <Link href={p.href} className="bt-row group">
                  <span className={cn("bt-ring [--paper-ring-size:2.5rem]", ringFor(p.tier))}>
                    <Icon className="size-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9rem] font-semibold text-ink">{p.title}</span>
                    <span className="block truncate text-[0.75rem] text-muted">{p.detail}</span>
                  </span>

                  <span className="bt-chip shrink-0">
                    {p.cta}
                    <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
