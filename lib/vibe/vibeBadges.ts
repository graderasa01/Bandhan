/**
 * C5 — Vibe Badges. Deterministic, never AI (D-32/§4's "Deterministic axis
 * averages" — this is the axis, made concrete): each poll option carries a
 * single "vibe" tag, same idea as `mindset.ts`'s `vibeFragment` but for the
 * Mindset Arena poll bank instead of the three onboarding questions. A user's
 * badge is simply whichever tag shows up most across their answered polls —
 * no invented psychometric score, no weighting, just "what did you actually
 * pick, most often."
 *
 * Deliberately a plain frequency count, not a multi-axis personality model:
 * this app already rejected quasi-diagnostic claims about a person (§7.3's
 * red/green-flag reframe) — a badge has to stay a fun, honest summary of
 * *this user's own answers*, never something that reads as an AI-derived
 * character judgement.
 *
 * Tags live here in code, options live in the DB (`prisma/seed.ts`) — same
 * split as everywhere else in this codebase (PLAN_FEATURES vs Plan,
 * QUESTS vs QuestProgress). Keyed by poll `slug` rather than `id` because
 * ids are generated at seed time; `null` entries are deliberate — an option
 * with no real vibe signal stays untagged rather than being forced into the
 * nearest bucket.
 */

export type VibeBadgeKey =
  | "FAMILY_FIRST"
  | "MODERN_MINDSET"
  | "PLANNER"
  | "SPONTANEOUS"
  | "ROMANTIC"
  | "PRACTICAL"
  | "BALANCED";

export interface VibeBadgeDef {
  label: string;
  description: string;
}

export const VIBE_BADGES: Record<VibeBadgeKey, VibeBadgeDef> = {
  FAMILY_FIRST: { label: "Parivaar Pehle", description: "Faisle family ke saath, family ke liye lete hain" },
  MODERN_MINDSET: { label: "Modern Mindset", description: "Naye tareeke aur apni soch se chalte hain" },
  PLANNER: { label: "Planner", description: "Soch samajh kar, discuss karke faisle lete hain" },
  SPONTANEOUS: { label: "Free Spirit", description: "Waqt aur mood ke hisaab se chalte hain" },
  ROMANTIC: { label: "Romantic at Heart", description: "Experience aur ek dusre ke saath waqt ko priority dete hain" },
  PRACTICAL: { label: "Practical Thinker", description: "Kaam ki baat, practical faisle pasand hain" },
  BALANCED: { label: "Balanced Soch", description: "Har baat ka beech ka raasta dhoondhte hain" },
};

/** Parallel to each poll's `options` array in prisma/seed.ts — same index, same order. */
export const POLL_OPTION_BADGES: Record<string, (VibeBadgeKey | null)[]> = {
  "diwali-alternate": ["FAMILY_FIRST", "BALANCED", "MODERN_MINDSET", "SPONTANEOUS"],
  "ghar-ka-budget": ["BALANCED", "PRACTICAL", "PRACTICAL", "MODERN_MINDSET"],
  "bada-ya-chhota-shehar": ["MODERN_MINDSET", "FAMILY_FIRST", "BALANCED", "PRACTICAL"],
  "honeymoon-pahad-ya-beach": ["ROMANTIC", "ROMANTIC", "ROMANTIC", "PRACTICAL"],
  "shaadi-bada-function": ["FAMILY_FIRST", "MODERN_MINDSET", "BALANCED", "MODERN_MINDSET"],
  "saas-susar-ke-saath": ["MODERN_MINDSET", "FAMILY_FIRST", "BALANCED", "FAMILY_FIRST"],
  "ghar-ke-kaam": ["MODERN_MINDSET", "MODERN_MINDSET", "PRACTICAL", "PRACTICAL"],
  "pet-rakhna": ["SPONTANEOUS", "PRACTICAL", "PLANNER", null],
  "shaadi-photos-social-media": ["MODERN_MINDSET", "BALANCED", "FAMILY_FIRST", "FAMILY_FIRST"],
  "financial-decisions": ["BALANCED", "PRACTICAL", "PLANNER", "FAMILY_FIRST"],
  "fight-ke-baad": [null, "PLANNER", "SPONTANEOUS", null],
  "in-laws-ke-ghar": ["SPONTANEOUS", "PLANNER", "FAMILY_FIRST", "BALANCED"],
  "career-priority": ["MODERN_MINDSET", "PRACTICAL", "SPONTANEOUS", "FAMILY_FIRST"],
  "bachon-ki-parvarish": [null, "MODERN_MINDSET", "BALANCED", null],
  "long-distance": [null, null, "PLANNER", null],
  "pehla-saal-shaadi": [null, "FAMILY_FIRST", "MODERN_MINDSET", "ROMANTIC"],
  "naam-badalna": [null, "MODERN_MINDSET", "MODERN_MINDSET", "BALANCED"],
  "ghar-ka-decor": ["MODERN_MINDSET", null, "BALANCED", "PRACTICAL"],
  "vacation-planning": ["ROMANTIC", "PLANNER", "ROMANTIC", "SPONTANEOUS"],
  "pooja-rituals": [null, "MODERN_MINDSET", "BALANCED", "MODERN_MINDSET"],
  "dost-circle": ["MODERN_MINDSET", "FAMILY_FIRST", "BALANCED", "SPONTANEOUS"],
  "salary-batana": ["MODERN_MINDSET", "BALANCED", "PLANNER", null],
  "phone-dinner-table": ["ROMANTIC", "BALANCED", "PLANNER", "MODERN_MINDSET"],
  "city-shift-kisliye": ["MODERN_MINDSET", "FAMILY_FIRST", "MODERN_MINDSET", "PLANNER"],
  "anniversary-celebration": ["ROMANTIC", "BALANCED", "SPONTANEOUS", "SPONTANEOUS"],
  "rishtedaar-function": ["FAMILY_FIRST", "FAMILY_FIRST", "SPONTANEOUS", null],
  "bada-purchase": ["MODERN_MINDSET", "PRACTICAL", "PRACTICAL", null],
  "naye-shehar-dost": [null, null, null, "SPONTANEOUS"],
  "emotional-support": ["ROMANTIC", "PRACTICAL", "ROMANTIC", null],
  "anniversary-gift": ["PRACTICAL", "ROMANTIC", "BALANCED", "ROMANTIC"],
  "bade-faisle-discussion": ["PLANNER", "BALANCED", "SPONTANEOUS", "FAMILY_FIRST"],
  "weekend-family-visit": ["FAMILY_FIRST", "SPONTANEOUS", null, "BALANCED"],
};

/** Below this many tagged answers, a badge would just be noise from one or two votes. */
export const MIN_VOTES_FOR_BADGE = 5;

interface TaggableVote {
  optionIndex: number;
  pollSlug: string;
}

/** Pure function — the actual tally + pick, shared by the single-user and batched lookups below. */
export function deriveVibeBadge(votes: TaggableVote[]): (VibeBadgeDef & { key: VibeBadgeKey }) | null {
  if (votes.length < MIN_VOTES_FOR_BADGE) return null;

  const tally = new Map<VibeBadgeKey, number>();
  for (const v of votes) {
    const tag = POLL_OPTION_BADGES[v.pollSlug]?.[v.optionIndex];
    if (!tag) continue;
    tally.set(tag, (tally.get(tag) ?? 0) + 1);
  }
  if (tally.size === 0) return null;

  // Stable on ties: Map preserves insertion order, and votes arrive
  // oldest-first from the caller, so the earliest-established lean wins
  // rather than the sort silently reshuffling on a tie.
  const [topKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return { key: topKey, ...VIBE_BADGES[topKey] };
}
