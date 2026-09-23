/**
 * The reel's behavioural layer — which tools this member actually reaches
 * for, and what that is allowed to change.
 *
 * ## The one rule: emphasis, never layout
 *
 * Personalisation here may make a control *louder or quieter*. It may never
 * move one, add one or take one away. The rail's order is fixed, the top bar's
 * order is fixed, and a member who learned where Kundli lives on Monday finds
 * it in the same place on Friday — a rail that reshuffles by "what's relevant
 * today" destroys the position memory that makes a rail faster than a menu
 * (the same reason the app's bottom nav is fixed, see `navItems.ts`).
 *
 * So the whole output is `ReelEmphasis`: a handful of booleans that decide
 * whether a badge is shown, whether a button is lit, and which section of the
 * details sheet comes first. Everything a member can do stays exactly where it
 * was whatever these say.
 *
 * ## What it learns from
 *
 * Only this member's own taps on this device, counted and decayed — "opened
 * Kundli", "opened the family section". Never anything about the people they
 * looked at, never sent to the server, never fed into ranking. Ranking has its
 * own learner (`behaviorLearning.ts`) with its own rules; this one only decides
 * how loudly the screen offers a tool. Losing it (private window, cleared
 * storage) costs nothing but the emphasis.
 *
 * Pure functions + one storage key, so `scripts/reel-workspace-check.ts` can
 * pin the thresholds.
 */

export type ReelAffinityFeature = "interest" | "save" | "kundli" | "grio" | "details" | "family" | "message";

export const REEL_AFFINITY_FEATURES: readonly ReelAffinityFeature[] = [
  "interest",
  "save",
  "kundli",
  "grio",
  "details",
  "family",
  "message",
];

export interface ReelAffinity {
  v: 1;
  /** Profiles moved past — the denominator every rate below divides by. */
  seen: number;
  uses: Record<ReelAffinityFeature, number>;
  /** Epoch ms of the last decay, so a month-old habit fades instead of ruling. */
  at: number;
}

export const REEL_AFFINITY_KEY = "reel-affinity-v1";

/** Two weeks: last week's habit should clearly outweigh last month's. */
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

/** A tool used on at least this share of profiles, at least this often, is a habit. */
const HABIT_RATE = 0.15;
const HABIT_MIN_USES = 3;

/** Seen this many profiles without ever reaching for a tool — it is being ignored. */
const IGNORED_AFTER_SEEN = 40;

export function emptyAffinity(now = Date.now()): ReelAffinity {
  const uses = Object.fromEntries(REEL_AFFINITY_FEATURES.map((f) => [f, 0])) as Record<ReelAffinityFeature, number>;
  return { v: 1, seen: 0, uses, at: now };
}

/** Halve everything once per half-life that has passed since `a.at`. */
export function decayAffinity(a: ReelAffinity, now = Date.now()): ReelAffinity {
  const elapsed = now - a.at;
  if (elapsed <= 0) return a;
  const factor = Math.pow(0.5, elapsed / HALF_LIFE_MS);
  // Not worth a new object for a few minutes' decay — it would only churn state.
  if (factor > 0.999) return a;
  const uses = { ...a.uses };
  for (const f of REEL_AFFINITY_FEATURES) uses[f] = uses[f] * factor;
  return { v: 1, seen: a.seen * factor, uses, at: now };
}

export function recordAffinityUse(a: ReelAffinity, feature: ReelAffinityFeature, now = Date.now()): ReelAffinity {
  const d = decayAffinity(a, now);
  return { ...d, uses: { ...d.uses, [feature]: d.uses[feature] + 1 } };
}

export function recordAffinitySeen(a: ReelAffinity, now = Date.now()): ReelAffinity {
  const d = decayAffinity(a, now);
  return { ...d, seen: d.seen + 1 };
}

function isHabit(a: ReelAffinity, feature: ReelAffinityFeature): boolean {
  const uses = a.uses[feature];
  return uses >= HABIT_MIN_USES && uses >= HABIT_RATE * Math.max(a.seen, 1);
}

function isIgnored(a: ReelAffinity, feature: ReelAffinityFeature): boolean {
  return a.seen >= IGNORED_AFTER_SEEN && a.uses[feature] < 0.5;
}

/** Everything personalisation is allowed to change — and nothing else. */
export interface ReelEmphasis {
  /** The guna total rides on the Kundli button. Off only once Kundli is clearly being ignored. */
  kundliBadge: boolean;
  /** Kundli opens the details sheet's sections, instead of sitting near the end. */
  kundliFirst: boolean;
  /** Family opens the details sheet's sections. */
  familyFirst: boolean;
  /** The Grio button is lit on cards that have reasons to talk about. */
  grioLit: boolean;
}

export const DEFAULT_EMPHASIS: ReelEmphasis = {
  kundliBadge: true,
  kundliFirst: false,
  familyFirst: false,
  grioLit: false,
};

export function emphasisFor(a: ReelAffinity | null): ReelEmphasis {
  if (!a) return DEFAULT_EMPHASIS;
  return {
    kundliBadge: !isIgnored(a, "kundli"),
    kundliFirst: isHabit(a, "kundli"),
    familyFirst: isHabit(a, "family"),
    grioLit: isHabit(a, "grio"),
  };
}

/** Parses whatever storage held; anything unexpected is a fresh start, never a crash. */
export function parseAffinity(raw: string | null, now = Date.now()): ReelAffinity {
  if (!raw) return emptyAffinity(now);
  try {
    const parsed = JSON.parse(raw) as Partial<ReelAffinity>;
    if (parsed?.v !== 1 || typeof parsed.seen !== "number" || typeof parsed.at !== "number" || !parsed.uses) {
      return emptyAffinity(now);
    }
    const base = emptyAffinity(parsed.at);
    for (const f of REEL_AFFINITY_FEATURES) {
      const n = (parsed.uses as Record<string, unknown>)[f];
      base.uses[f] = typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
    }
    base.seen = Math.max(0, parsed.seen);
    return base;
  } catch {
    return emptyAffinity(now);
  }
}
