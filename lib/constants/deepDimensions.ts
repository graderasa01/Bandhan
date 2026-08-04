/**
 * D-11's `deepDimensions` — 05_ai_spec.md §15's 13 named dimensions.
 *
 * Same pattern as `lib/constants/plans.ts` and `lib/quests/definitions.ts`:
 * the catalog is code, so a dimension can never exist without a label and a
 * "why this matters" line someone reviewed. What's computed *for* a profile
 * lives in the database (`ProfileDimensionScore`); what a dimension *is*
 * lives here.
 */
import type { DeepDimensionKey } from "@prisma/client";

export const DIMENSION_KEYS: DeepDimensionKey[] = [
  "FAMILY_ORIENTATION",
  "CAREER_FOCUS",
  "COMMUNICATION_CLARITY",
  "EMOTIONAL_MATURITY",
  "PRACTICAL_DECISION_STYLE",
  "ADAPTABILITY",
  "FINANCIAL_DISCIPLINE",
  "TRADITION_MODERN_BALANCE",
  "RELATIONSHIP_READINESS",
  "CONFLICT_HANDLING",
  "LONG_TERM_STABILITY",
  "LIFESTYLE_ALIGNMENT",
  "PARTNER_SUPPORT_EXPECTATION",
];

export const DIMENSION_LABELS: Record<DeepDimensionKey, string> = {
  FAMILY_ORIENTATION: "Family Orientation",
  CAREER_FOCUS: "Career Focus",
  COMMUNICATION_CLARITY: "Communication Style",
  EMOTIONAL_MATURITY: "Emotional Maturity",
  PRACTICAL_DECISION_STYLE: "Decision-Making Style",
  ADAPTABILITY: "Adaptability",
  FINANCIAL_DISCIPLINE: "Financial Discipline",
  TRADITION_MODERN_BALANCE: "Tradition vs Modern Balance",
  RELATIONSHIP_READINESS: "Relationship Readiness",
  CONFLICT_HANDLING: "Conflict Handling",
  LONG_TERM_STABILITY: "Long-Term Stability",
  LIFESTYLE_ALIGNMENT: "Lifestyle Alignment",
  PARTNER_SUPPORT_EXPECTATION: "Partner Support Expectation",
};

/** One line each — what a stranger reading this profile would want to know. */
export const DIMENSION_DESCRIPTIONS: Record<DeepDimensionKey, string> = {
  FAMILY_ORIENTATION: "Family ke saath rehna, unke faislon me kitna involve rehna chahte hain.",
  CAREER_FOCUS: "Career ko kitni priority dete hain, ambition ka level.",
  COMMUNICATION_CLARITY: "Baat khul kar karte hain ya reserved rehte hain.",
  EMOTIONAL_MATURITY: "Mushkil situations me kitna sthir aur samajhdar rehte hain.",
  PRACTICAL_DECISION_STYLE: "Bade faisle dil se lete hain ya soch-samajh kar.",
  ADAPTABILITY: "Naye logon, jagah aur situation me kitni jaldi dhal jaate hain.",
  FINANCIAL_DISCIPLINE: "Paise ko lekar planning aur savings ka rukh.",
  TRADITION_MODERN_BALANCE: "Parampara aur modern soch ke beech kahan khade hain.",
  RELATIONSHIP_READINESS: "Shaadi ke commitment ke liye kitne tayyar hain.",
  CONFLICT_HANDLING: "Matbhed hone par kaise react karte hain.",
  LONG_TERM_STABILITY: "Life goals kitne clear aur stable hain.",
  LIFESTYLE_ALIGNMENT: "Roz ki zindagi — diet, habits, routine — kaisi hai.",
  PARTNER_SUPPORT_EXPECTATION: "Partner se emotionally/practically kya support chahiye.",
};

/**
 * Which 3 of 13 the Free tier gets. No spec named these (confirmed —
 * `10_engagement_and_monetization_architecture.md` flagged this as the one
 * unresolved gap), so the choice is made here, deliberately, not left
 * implicit:
 *
 * These three lean on fields already required by Stage 1/2 profile
 * completion (family type & values, lifestyle habits) rather than optional
 * ones like `bioText` or the tap-only mindset questions. That means a Free
 * user whose profile is merely *complete* — not enriched with an essay bio —
 * still gets three real, non-UNKNOWN scores instead of three that usually
 * come back UNKNOWN for lack of signal. A locked-but-empty preview would be
 * a worse upsell than an honest one.
 */
export const FREE_TIER_DIMENSIONS: DeepDimensionKey[] = [
  "FAMILY_ORIENTATION",
  "LIFESTYLE_ALIGNMENT",
  "TRADITION_MODERN_BALANCE",
];

export const DIMENSION_SCORE_LABELS = ["LOW", "MODERATE", "GOOD", "STRONG", "UNKNOWN"] as const;
export type DimensionScoreLabel = (typeof DIMENSION_SCORE_LABELS)[number];

/** §15.3: below this, a score must not be shown as a number — UNKNOWN only. */
export const CONFIDENCE_UNKNOWN_THRESHOLD = 0.6;

/**
 * How many of the 13 a plan unlocks, and which ones. Only two shapes exist in
 * today's ladder (3 or 13); `count` stays generic so a future plan offering,
 * say, 6 doesn't need a second lookup table — it would take
 * `FREE_TIER_DIMENSIONS` first (as the "always useful" baseline) then fill
 * the rest in catalog order.
 */
export function getEntitledDimensionKeys(count: number): DeepDimensionKey[] {
  if (count >= DIMENSION_KEYS.length) return DIMENSION_KEYS;
  if (count <= 0) return [];
  const rest = DIMENSION_KEYS.filter((k) => !FREE_TIER_DIMENSIONS.includes(k));
  return [...FREE_TIER_DIMENSIONS, ...rest].slice(0, count);
}
