import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { BehaviorMode, BehaviorStatus, DiscoverFilters } from "@/lib/discovery/contract";
import {
  BEHAVIOR_TARGET_SELECT,
  BEHAVIOR_WINDOW,
  MIN_DECISIONS,
  MIN_POSITIVE,
  aggregateBehaviorDimensions,
  buildLearnedBehaviorProfile,
  countEligibleSwipes,
  type BehaviorDimension,
  type DimensionScores,
  type LearnedBehaviorProfile,
} from "./behaviorLearning";

/**
 * Behaviour-based discovery — the three "smart" modes of `/user/discover`,
 * each a different *input* to the one learner in `behaviorLearning.ts`:
 *
 *   activity   — the existing learner, unchanged: latest 100 LEFT/RIGHT/DOWN
 *                swipes, ≥20 decisions and ≥3 positive before it says anything.
 *   positive   — RIGHT/DOWN swipes only (what the user said yes to), same
 *                window, same recency decay. No negatives exist in this input,
 *                so the decision threshold is the positive one (≥3).
 *   shortlist  — the user's own shortlist rows, most recent first. Deliberate
 *                saves rather than swipes, so "Reset learned behaviour" (a
 *                swipe cutoff) does not apply; "Pause learning" still does.
 *
 * ## What comes out is filters, not a score
 *
 * An active mode yields `LearnedDimensionFilter`s — "Sheher: Jaipur, Delhi",
 * "Umar: 25–29" — the top positively-weighted values per dimension, and the
 * search service runs them as ordinary catalog filters (a candidate must share
 * at least two learned dimensions, or one when fewer than three were learned).
 * The result card then lists which learned dimensions *this* candidate shares.
 * There is no affinity percentage anywhere on this path: `computeBehaviorAffinity`
 * exists for the reel's ranking bucket (D-33) and is deliberately not called
 * here, because a "78% aapki pasand jaisa" on a search card would be a ranking
 * claim made by a page that only ever promised exact filters.
 *
 * ## Explicit always wins
 *
 * A dimension the user filtered on themselves (a city, an age range) is never
 * also learned — the learned version would only ever loosen or contradict what
 * they typed. Behaviour fills the dimensions the user left open, nothing more.
 */

export type LearnedDimension = BehaviorDimension | "diet" | "smoking" | "drinking";

export interface LearnedDimensionFilter {
  dimension: LearnedDimension;
  /** Hinglish, e.g. "Sheher: Jaipur, Delhi" — what the card and the status line show. */
  label: string;
  values: string[];
  /** For `ageBand` — the union of the learned bands as a single range. */
  ageRange?: { min: number; max: number };
}

export interface BehaviorResolution {
  status: BehaviorStatus;
  learned: LearnedDimensionFilter[];
}

const OFF: BehaviorResolution = {
  status: {
    mode: "none",
    state: "off",
    sampleSize: 0,
    positiveCount: 0,
    threshold: { decisions: MIN_DECISIONS, positive: MIN_POSITIVE },
    appliedDimensions: [],
    message: "",
  },
  learned: [],
};

function topValues(scores: DimensionScores, n: number, prefix?: string): string[] {
  return [...scores.entries()]
    .filter(([v, w]) => w > 0 && (!prefix || v.startsWith(prefix)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([v]) => (prefix ? v.slice(prefix.length) : v));
}

/** "24-26" + "27-29" → {min: 24, max: 29}. Bands are contiguous 3-year buckets, so the union is one range. */
function bandsToRange(bands: string[]): { min: number; max: number } | null {
  const nums = bands
    .map((b) => b.split("-").map(Number))
    .filter(([a, z]) => Number.isFinite(a) && Number.isFinite(z));
  if (nums.length === 0) return null;
  return { min: Math.min(...nums.map(([a]) => a)), max: Math.max(...nums.map(([, z]) => z)) };
}

/**
 * Learned dimensions → filters, skipping every dimension the explicit filters
 * already cover. Deterministic: the same learned profile and the same explicit
 * filters always produce the same list, in the same order.
 */
export function learnedFilters(
  dimensions: Record<BehaviorDimension, DimensionScores>,
  explicit: DiscoverFilters,
): LearnedDimensionFilter[] {
  const out: LearnedDimensionFilter[] = [];

  const placeExplicit = (explicit.cities?.length ?? 0) + (explicit.states?.length ?? 0) + (explicit.countries?.length ?? 0) > 0;
  if (!placeExplicit) {
    const cities = topValues(dimensions.city, 3);
    if (cities.length) out.push({ dimension: "city", label: `Sheher: ${cities.join(", ")}`, values: cities });
  }

  if (explicit.minAge == null && explicit.maxAge == null) {
    const bands = topValues(dimensions.ageBand, 2);
    const range = bandsToRange(bands);
    if (range) out.push({ dimension: "ageBand", label: `Umar: ${range.min}–${range.max}`, values: bands, ageRange: range });
  }

  if (!explicit.education?.length && !explicit.educationTier) {
    const edu = topValues(dimensions.education, 2);
    if (edu.length) out.push({ dimension: "education", label: `Shiksha: ${edu.join(", ")}`, values: edu });
  }

  if (!explicit.professionCategory?.length) {
    const cats = topValues(dimensions.professionCategory, 2);
    if (cats.length) out.push({ dimension: "professionCategory", label: `Kaam: ${cats.join(", ")}`, values: cats });
  }

  if (!explicit.diet?.length) {
    const v = topValues(dimensions.lifestyle, 1, "diet:");
    if (v.length) out.push({ dimension: "diet", label: `Diet: ${v[0]}`, values: v });
  }
  if (!explicit.smoking?.length) {
    const v = topValues(dimensions.lifestyle, 1, "smoking:");
    if (v.length) out.push({ dimension: "smoking", label: `Smoking: ${v[0]}`, values: v });
  }
  if (!explicit.drinking?.length) {
    const v = topValues(dimensions.lifestyle, 1, "drinking:");
    if (v.length) out.push({ dimension: "drinking", label: `Drinking: ${v[0]}`, values: v });
  }

  return out;
}

function status(
  mode: BehaviorMode,
  state: BehaviorStatus["state"],
  counts: { sampleSize: number; positiveCount: number },
  threshold: { decisions: number; positive: number },
  learned: LearnedDimensionFilter[],
): BehaviorStatus {
  const message =
    state === "paused"
      ? "Behaviour learning abhi paused hai — sirf aapke likhe filters lage hain."
      : state === "collecting"
        ? `Discover abhi aapki pasand seekh raha hai — ${Math.min(counts.sampleSize, threshold.decisions)}/${threshold.decisions} choices complete. Tab tak sirf aapke likhe filters lage hain.`
        : state === "active"
          ? learned.length > 0
            ? `Aapki recent choices se milta-julta — ${learned.map((l) => l.label).join(" · ")}`
            : "Aapki recent choices se milta-julta — jo dimensions aapne khud filter kiye, unhe waise hi rakha hai."
          : "";
  return { mode, state, sampleSize: counts.sampleSize, positiveCount: counts.positiveCount, threshold, appliedDimensions: learned.map((l) => l.label), message };
}

/**
 * Which learned dimensions, if any, apply to this search — and the honest
 * status to show when they do not (paused, or still collecting with a real
 * "12/20" count rather than a vague "learning...").
 */
export async function resolveBehavior(userId: string, mode: BehaviorMode, explicit: DiscoverFilters): Promise<BehaviorResolution> {
  if (mode === "none") return OFF;

  const settings = await prisma.discoverySettings.findUnique({ where: { userId } });
  const paused = settings ? !settings.behaviorLearningEnabled : false;
  const resetAt = settings?.behaviorResetAt ?? null;

  if (mode === "activity") {
    const threshold = { decisions: MIN_DECISIONS, positive: MIN_POSITIVE };
    if (paused) {
      const counts = await countEligibleSwipes(userId, resetAt);
      return { status: status(mode, "paused", { sampleSize: counts.total, positiveCount: counts.positive }, threshold, []), learned: [] };
    }
    const profile: LearnedBehaviorProfile | null = await buildLearnedBehaviorProfile(userId);
    if (!profile) {
      const counts = await countEligibleSwipes(userId, resetAt);
      return { status: status(mode, "collecting", { sampleSize: counts.total, positiveCount: counts.positive }, threshold, []), learned: [] };
    }
    const learned = learnedFilters(profile.dimensions, explicit);
    return { status: status(mode, "active", { sampleSize: profile.sampleSize, positiveCount: profile.positiveCount }, threshold, learned), learned };
  }

  // The two positive-only inputs share one threshold: there are no negative
  // decisions in either, so "enough decisions" and "enough positives" are the
  // same number — the learner's existing MIN_POSITIVE.
  const threshold = { decisions: MIN_POSITIVE, positive: MIN_POSITIVE };

  if (mode === "positive") {
    const swipes = await prisma.swipeAction.findMany({
      where: {
        actorUserId: userId,
        direction: { in: ["RIGHT", "DOWN"] },
        ...(resetAt ? { createdAt: { gt: resetAt } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: BEHAVIOR_WINDOW,
      select: { targetProfile: { select: BEHAVIOR_TARGET_SELECT } },
    });
    const counts = { sampleSize: swipes.length, positiveCount: swipes.length };
    if (paused) return { status: status(mode, "paused", counts, threshold, []), learned: [] };
    if (swipes.length < MIN_POSITIVE) return { status: status(mode, "collecting", counts, threshold, []), learned: [] };
    const dims = aggregateBehaviorDimensions(swipes.map((s) => ({ positive: true, target: s.targetProfile })));
    const learned = learnedFilters(dims, explicit);
    return { status: status(mode, "active", counts, threshold, learned), learned };
  }

  // mode === "shortlist"
  const rows = await prisma.shortlist.findMany({
    where: { userId, targetProfile: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: BEHAVIOR_WINDOW,
    select: { targetProfile: { select: BEHAVIOR_TARGET_SELECT } },
  });
  const counts = { sampleSize: rows.length, positiveCount: rows.length };
  if (paused) return { status: status(mode, "paused", counts, threshold, []), learned: [] };
  if (rows.length < MIN_POSITIVE) return { status: status(mode, "collecting", counts, threshold, []), learned: [] };
  const dims = aggregateBehaviorDimensions(rows.map((r) => ({ positive: true, target: r.targetProfile })));
  const learned = learnedFilters(dims, explicit);
  return { status: status(mode, "active", counts, threshold, learned), learned };
}
