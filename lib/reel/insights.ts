/**
 * What the face of a reel card may say about somebody — decided once, in
 * pure functions, from fields the card already carries.
 *
 * The reel shows a person in three layers (see `ReelIdentity`): who they are
 * in one second, what they are like in five, and everything else on request.
 * Every line those layers print comes from here, so there is exactly one
 * answer to "what are this person's chips" or "how many reasons does this card
 * have", and `scripts/reel-workspace-check.ts` can prove each answer without
 * mounting a component.
 *
 * Nothing here computes a new judgement. The reasons are `whyThisMatch.ts`'s
 * own ranked output, the chips are the person's own L1 facts plus the code's
 * deterministic overlap, and the cautions are sentences the server already
 * wrote. A reel that phrased its own conclusions at render time would be one
 * more place a claim could be invented — D-32 keeps that door shut.
 */

import type { ReelCardViewModel, ReelProfileGap } from "@/lib/contracts/reel";
import { noopT, type Translate } from "@/lib/i18n/translate";

/* ------------------------------------------------------------------ */
/* Chips — "what is this person like", in three words                  */
/* ------------------------------------------------------------------ */

/**
 * The facts whose *value* is a readable chip on its own, in the order a
 * stranger would find them useful.
 *
 * An allow-list rather than "every lifestyle fact": `buildCandidateFacts`
 * pushes `{ label: "Smoking", value: "Nahi" }`, and a chip reading "Nahi" over
 * somebody's photograph says nothing at all. "Vegetarian", "Joint family",
 * "Reading" need no label.
 *
 * The keys are the exact labels `candidateFacts.ts` writes — the same coupling
 * `SHEET_FACT_GROUPS` already has, and going through it is what keeps a chip
 * from ever showing a field the person kept private.
 */
const CHIP_FACT_LABELS = ["Shauk", "Khaan-paan", "Parivaar ka prakar", "Bhashayein"] as const;

/** A fact's value may be a list ("Reading, Music") — a chip takes the first. */
function firstValue(value: string): string {
  const head = value.split(",")[0]?.trim();
  return head && head.length <= 22 ? head : value.trim().slice(0, 22);
}

export interface ProfileChip {
  /** The value — the word that actually means something on its own. */
  text: string;
  /** "Same city", "Common hobby" — the field, when the tag names one. */
  label?: string;
  /** Something the code compared between *you two*, not a fact about them alone. */
  shared: boolean;
}

/**
 * "Common hobby: Padhna" → label + value, so the chip can print the field
 * small and the answer big. Only the three shapes `computeSharedTags` produces
 * exist; "Dono Veg" has no field to name and comes back label-less.
 */
function splitTag(tag: string): { text: string; label?: string } {
  const at = tag.indexOf(": ");
  if (at <= 0) return { text: tag };
  return { label: tag.slice(0, at), text: tag.slice(at + 2) };
}

/**
 * Up to `limit` chips for this person: the pair's own overlap first (the only
 * chip that says something about the reader as well), then their published
 * mindset badge, then their own readable facts.
 */
export function profileChips(card: ReelCardViewModel, limit = 3): ProfileChip[] {
  const chips: ProfileChip[] = [];

  for (const tag of card.sharedTags) chips.push({ ...splitTag(tag), shared: true });

  if (card.vibeBadge) chips.push({ text: card.vibeBadge.label, shared: false });

  for (const label of CHIP_FACT_LABELS) {
    const fact = card.facts.find((f) => f.label === label);
    if (!fact) continue;
    const text = firstValue(fact.value);
    if (!text) continue;
    if (chips.some((c) => c.text.toLowerCase() === text.toLowerCase())) continue;
    chips.push({ text, shared: false });
  }

  return chips.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* The one-line summary under the name                                  */
/* ------------------------------------------------------------------ */

/**
 * "Software Engineer · Jaipur" — what they do and where they are, in one
 * line. Education stands in for work only when work is empty, so the line is
 * never two things of the same kind. Empty fields are skipped, never printed
 * as a dash: a profile that has not said where it works is a shorter line,
 * not a broken one.
 */
export function profileSummaryLine(card: Pick<ReelCardViewModel, "profession" | "education" | "city">): string {
  return [card.profession ?? card.education, card.city].filter((v): v is string => Boolean(v && v.trim())).join(" · ");
}

/* ------------------------------------------------------------------ */
/* Why this rishta — the card's reasons, ranked by the server           */
/* ------------------------------------------------------------------ */

export interface ReelReason {
  text: string;
  /** The model's cached phrasing — drawn with an "AI" tag, never as a fact. */
  ai: boolean;
}

/**
 * The reasons this card is on screen, exactly as `whyThisMatch.ts` ranked and
 * de-duplicated them: the confirmed value connection first, then up to three
 * reasons. The count of these is the only number the card's "Ye rishta kyun"
 * line may print — and when there are none the line is simply absent, never
 * "0 wajah".
 */
export function reelReasons(card: Pick<ReelCardViewModel, "whyThisMatch">): ReelReason[] {
  const why = card.whyThisMatch;
  return [
    ...(why.valueConnection ? [{ text: why.valueConnection, ai: false }] : []),
    ...why.reasons.map((r) => ({ text: r.text, ai: r.kind === "ai" })),
  ];
}

export interface ReelCaution {
  text: string;
  ai: boolean;
}

/**
 * The honest "par ye bhi dekhiye" lines, in the order they matter: a real
 * clash or gap between the two profiles, the AI's cached concern (tagged), the
 * app's own admission that it widened the viewer's age range, and a kundli
 * note whose tone is a caution. Nothing is added here that the server did not
 * already write.
 */
export function reelCautions(
  card: Pick<ReelCardViewModel, "whyThisMatch" | "concern" | "preference" | "kundli">,
  t: Translate = noopT,
): ReelCaution[] {
  const out: ReelCaution[] = [];
  if (card.whyThisMatch.unclear) out.push({ text: card.whyThisMatch.unclear, ai: false });
  if (card.concern) out.push({ text: card.concern, ai: true });
  if (card.preference.note) out.push({ text: card.preference.note, ai: false });
  if (card.kundli.notes.some((n) => n.tone === "caution")) {
    out.push({ text: t("reel.insight.kundliCaution", "Parampara ka ek note hai — Kundli me dekhein."), ai: false });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Profile depth — the compact completeness signal                      */
/* ------------------------------------------------------------------ */

/** How each empty section is named on a card — short, and about the section, not a field. */
export function profileGapLabel(gap: ReelProfileGap, t: Translate = noopT): string {
  switch (gap) {
    case "family":
      return t("reel.gap.family", "Family details");
    case "about":
      return t("reel.gap.about", "About me");
    case "expectations":
      return t("reel.gap.expectations", "Partner expectations");
    case "values":
      return t("reel.gap.values", "Values");
    case "lifestyle":
      return t("reel.gap.lifestyle", "Lifestyle");
  }
}

/**
 * Whether the completeness number is worth a place on the face of the card.
 *
 * A number is news at both ends — a thoroughly filled profile is a real trust
 * signal, a thin one is a real caution — and noise in the middle, where every
 * profile sits. So the card shows it only outside that band; the details
 * sheet always has it.
 */
export const COMPLETENESS_HIGH = 80;
export const COMPLETENESS_LOW = 45;

export function completenessIsNews(percent: number): boolean {
  return percent >= COMPLETENESS_HIGH || (percent > 0 && percent <= COMPLETENESS_LOW);
}
