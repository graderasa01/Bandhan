/**
 * Phase F — who may enter the Serious Circle.
 *
 * ## The one problem this file solves
 *
 * "Are you serious about marriage?" as a checkbox is worth exactly nothing —
 * every single user ticks it. The gates below are chosen on one criterion:
 * **cheap to satisfy if you actually are serious, expensive to fake if you
 * aren't.** Nothing here asks the user to claim anything; each gate is
 * something they had to *do*.
 *
 * A gate that only filters out lazy users is not a gate, it is a form. That is
 * why "profile 100% complete" alone would be useless — a determined timepass
 * user fills forms. Adding a real family member to your account is the gate
 * that actually bites, because timepass users do not involve their parents.
 *
 * ## Why the copy lives here and not in the component
 *
 * The UI renders a *checklist*, not a yes/no — a user turned away with
 * "aap eligible nahi hain" learns nothing and never comes back, while one who
 * sees "3 of 4 ho gaya, bas family member add karna hai" finishes the fourth.
 * Keeping the reason strings next to the predicates is what stops those two
 * from drifting apart.
 *
 * Content is code, same call as QUESTS and PLAN_FEATURES — an admin may turn
 * the whole feature off, but may not quietly loosen who counts as serious.
 */
import type { MarriageTimeline, ProfileStatus } from "@prisma/client";

export const CIRCLE_GATE_KEYS = ["profile", "verified", "family", "timeline", "standing"] as const;
export type CircleGateKey = (typeof CIRCLE_GATE_KEYS)[number];

export interface CircleGate {
  key: CircleGateKey;
  label: string;
  /** Shown when the gate is not yet passed. Says what to do, never scolds. */
  todo: string;
  /** Where the user goes to fix it. Null when there is nothing to click. */
  href: string | null;
  ctaLabel: string | null;
  passed: boolean;
}

/**
 * Minimum profile completeness to enter — measured against
 * `fullProfileFields()` (lib/profile/stages.ts), which is every card's field,
 * required and optional both, minus the handful the catalog marks
 * `sensitive` (those stay voluntary even here, see that function's doc).
 * Literal 100: a Circle match is exactly the moment "just enough to go live"
 * stops being enough — the other side deserves the whole profile, not the
 * eight fields it took to get a Reel.
 */
export const CIRCLE_MIN_COMPLETION = 100;

export interface CircleEligibilityInput {
  profileStatus: ProfileStatus | null;
  /** % of fullProfileFields() answered — required + optional, sensitive/photo excluded. */
  fullProfileCompletionScore: number;
  /** Count of FamilyMember rows in ACTIVE status — invited-but-never-joined does not count. */
  activeFamilyCount: number;
  marriageTimeline: MarriageTimeline | null;
  /** From SeriousBadge.suspendedUntil, if a ghosting penalty is live. */
  badgeSuspendedUntil: Date | null;
}

export interface CircleEligibility {
  gates: CircleGate[];
  eligible: boolean;
  passedCount: number;
  totalCount: number;
}

export function evaluateEligibility(input: CircleEligibilityInput, now = new Date()): CircleEligibility {
  const suspended = input.badgeSuspendedUntil !== null && input.badgeSuspendedUntil > now;

  const gates: CircleGate[] = [
    {
      key: "profile",
      label: "Profile poori bhari hui",
      todo:
        input.fullProfileCompletionScore >= CIRCLE_MIN_COMPLETION
          ? ""
          : `Abhi ${input.fullProfileCompletionScore}% hui hai — sabhi cards bharne hain, sirf zaroori wale nahi.`,
      href: "/user/profile-setup",
      ctaLabel: "Complete profile",
      passed: input.fullProfileCompletionScore >= CIRCLE_MIN_COMPLETION,
    },
    {
      key: "verified",
      label: "Profile verified",
      todo: "Profile submit kijiye — verification ke baad hi Circle khulta hai.",
      href: "/user/profile-trust-score",
      ctaLabel: "Check status",
      // SUBMITTED counts alongside VERIFIED: the same pair the reel's
      // `getCandidates` treats as real profiles. Holding Circle entry to a
      // manual review queue would make the gate about our turnaround time
      // rather than about the user.
      passed: input.profileStatus === "VERIFIED" || input.profileStatus === "SUBMITTED",
    },
    {
      key: "family",
      label: "Ek family member juda hua",
      // The strongest signal in the whole list, and the reason it is worded as
      // an invitation rather than a requirement: someone who is serious has
      // usually already told their family, so this is a two-minute job for
      // them and a wall for everyone else.
      todo: "Ghar se kisi ek ko Family Circle me jodiye — Circle me yahi sabse bada bharosa hai.",
      href: "/user/family",
      ctaLabel: "Add family member",
      passed: input.activeFamilyCount > 0,
    },
    {
      key: "timeline",
      label: "Shaadi ka samay bataya hua",
      todo: "Bataiye shaadi kab tak karni hai — 3 mahine, 6 mahine, ya 1 saal.",
      href: "/user/circle",
      ctaLabel: "Set timeline",
      passed: input.marriageTimeline !== null,
    },
    {
      key: "standing",
      label: "Circle standing theek",
      todo: suspended
        ? `Pichhli baar connect hone ke baad jawab nahi diya. ${formatUntil(input.badgeSuspendedUntil!)} tak intezaar kijiye.`
        : "",
      href: null,
      ctaLabel: null,
      passed: !suspended,
    },
  ];

  const passedCount = gates.filter((g) => g.passed).length;
  return { gates, eligible: passedCount === gates.length, passedCount, totalCount: gates.length };
}

function formatUntil(date: Date): string {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const MARRIAGE_TIMELINE_OPTIONS: { value: MarriageTimeline; label: string }[] = [
  { value: "WITHIN_3_MONTHS", label: "3 mahine ke andar" },
  { value: "WITHIN_6_MONTHS", label: "6 mahine ke andar" },
  { value: "WITHIN_1_YEAR", label: "1 saal ke andar" },
];

export const MARRIAGE_TIMELINE_LABEL: Record<MarriageTimeline, string> = {
  WITHIN_3_MONTHS: "3 mahine ke andar",
  WITHIN_6_MONTHS: "6 mahine ke andar",
  WITHIN_1_YEAR: "1 saal ke andar",
};
