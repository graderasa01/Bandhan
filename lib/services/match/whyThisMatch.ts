import { noopT, type Translate } from "@/lib/i18n/translate";
import type { CompatibilityDimension, CompatibilityReport } from "./compatibilityLab";
import type { SochFit } from "./sochFit";
import type { CandidateFacts } from "./candidateFacts";
import type { PreferenceEvidenceState } from "./preferenceEvidence";

/**
 * "Why this match?" — the structured, deterministic layer under every reel card.
 *
 * Pure TypeScript: no prisma, no AI, no `server-only`. Same split and the same
 * reason as `compatibilityLab.ts` — the decision about *which* facts may be
 * called a reason has to be testable without a database and must never be
 * made by a model (D-32: AI explains, code decides).
 *
 * ## Eligibility
 *
 * A line may become a reason only if it is one of:
 *
 *   - a real signal agreement — `CompatibilityReport.aligned`, i.e. the same
 *     comparators the ranking already uses — on a **PROFILE_VISIBLE** question;
 *   - a soch-fit count the user could recount themselves;
 *   - the AI's cached strengths (`DailyReelProfile.aiReasonText`), already
 *     visibility-safe (L1) and already checked by the caller for staleness;
 *   - a deterministic shared tag (same city / diet / hobby);
 *   - the preference line — only when the pair is genuinely COMPARABLE.
 *
 * ## Order: importance, not catalog position
 *
 * `compatibilityLab.ts` lists `childrenPreference` first because it was the
 * first dimension modelled, and for a while that made "Bachche" the top reason
 * on every card that had it. Reasons are now ranked by `DIMENSION_PRIORITY` /
 * `TOPIC_PRIORITY` — career, education, location, relocation, living
 * expectations, then verified common facts — and by evidence quality inside
 * each rank. Catalog order never decides what a stranger reads first.
 *
 * ## Privacy — stricter than the Lab
 *
 * The Lab may *describe* a MATCH_PRIVATE dimension in derived form ("aap dono
 * ka rukh ek jaisa hai") because its card sits on a profile the viewer opened.
 * The reel is pre-match discovery: children, money, conflict style and the
 * other MATCH_PRIVATE topics do not appear here at all — not as a reason, not
 * as the "unclear" line, not as a starter question. `candidateAnswerIsPrivate`
 * is the gate, read from the catalog by the Lab, never re-judged here.
 *
 * Every slot that has nothing eligible stays `null`/empty. The UI renders
 * "Is baat ki jaankari abhi nahi di gayi." there — a guess is never made.
 */

export type WhyReasonKind = "fact" | "ai";

export interface WhyReason {
  text: string;
  /**
   * `fact` — code compared two real profile values (a signal agreement, a soch
   * count, a shared tag, a comparable preference score). `ai` — the model's
   * cached phrasing of L1 facts. The card draws the two differently so a
   * reader always knows which is which.
   */
  kind: WhyReasonKind;
}

export interface WhyThisMatch {
  /** Up to 3 strongest fit reasons, importance-ordered (Hinglish, one short line each). */
  reasons: WhyReason[];
  /** One confirmed, public value connection, else null. */
  valueConnection: string | null;
  /** One REAL missing/unconfirmed/clashing public topic, else null. */
  unclear: string | null;
  /** One conversation starter grounded in the lines above, else null. */
  starter: string | null;
}

export interface WhyThisMatchInput {
  candidateName: string;
  /** Null when either side's profile could not be compared. */
  report: CompatibilityReport | null;
  sochFit: SochFit | null;
  /** Cached AI strengths — never a fresh call, and already dropped by the caller when stale. */
  strengths: string[];
  /** Deterministic viewer↔candidate overlap chips, as already shown on the card. */
  sharedTags: string[];
  /**
   * The pair's preference verdict. A line is offered only when the state is
   * COMPARABLE and the score is clearly high; NOT_PROVIDED and PARTIAL never
   * produce a percentage anywhere on the card.
   */
  preference: { state: PreferenceEvidenceState; score: number | null };
  /** The candidate's L1 facts — used only to name a genuinely empty field. */
  facts: CandidateFacts | null;
}

/** Same floors `sochFit.ts` trusts — below these the counts are noise, not evidence. */
const MIN_COMMON_SIGNALS = 3;
const MIN_COMMON_POLLS = 3;
const MIN_COMMON_MINDSET = 2;
/** A preference score only earns a line when it is clearly above "meh". */
const PREFERENCE_LINE_FLOOR = 75;
const MAX_REASONS = 3;

const EVIDENCE_RANK = { high: 0, medium: 1, low: 2 } as const;

/**
 * Word families that mean "the same fact" across the AI's Hinglish, the
 * shared-tag templates and the catalog labels. Two lines sharing a family are
 * one reason said twice — the reel shows the first and drops the rest.
 */
const TOPIC_FAMILIES: string[][] = [
  ["city", "sheher", "shahar", "shehar"],
  ["diet", "khaan", "vegetarian", "veg", "non-veg", "nonveg", "khana"],
  ["hobby", "shauk", "hobbies"],
  ["education", "shiksha", "padhai", "degree", "qualification"],
  ["profession", "kaam", "job", "career", "naukri"],
  ["relocation", "relocate", "shift", "city-change"],
  ["family", "parivaar", "joint", "nuclear"],
  ["language", "bhasha", "bhashayein", "languages"],
];

/**
 * What a reader should see first. Lower is more important. Topics a family
 * actually decides on — work, education, where the couple will live — outrank
 * a shared hobby, whatever order the catalog or the model produced them in.
 */
const TOPIC_PRIORITY: Record<string, number> = {
  profession: 1,
  education: 2,
  city: 3,
  relocation: 4,
  family: 5,
  language: 6,
  diet: 7,
  hobby: 8,
};

/** Catalog dimensions that are decision-grade, in the order they should read. */
const DIMENSION_PRIORITY: Record<string, number> = {
  partnerCareerExpectation: 1,
  careerPriority: 1,
  relocationBoundary: 4,
  postMarriageLivingPlan: 5,
  marriageTimeline: 6,
  familyIntroductionTiming: 6,
  relationshipReadiness: 6,
};

const DEFAULT_PRIORITY = 9;

function tokens(line: string): Set<string> {
  return new Set(
    line
      .toLowerCase()
      .replace(/[^a-z0-9ऀ-ॿ\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

function familiesOf(words: Set<string>): Set<number> {
  const out = new Set<number>();
  TOPIC_FAMILIES.forEach((family, i) => {
    if (family.some((w) => words.has(w))) out.add(i);
  });
  return out;
}

/** The best (lowest) topic priority a free-text line mentions, else the default. */
function textPriority(line: string): number {
  const words = tokens(line);
  let best = DEFAULT_PRIORITY;
  for (const i of familiesOf(words)) {
    const name = TOPIC_FAMILIES[i][0];
    best = Math.min(best, TOPIC_PRIORITY[name] ?? DEFAULT_PRIORITY);
  }
  return best;
}

type LineKind = "value" | "signal" | "soch" | "ai" | "tag" | "pref";
type Line = { kind: LineKind; text: string; priority: number; evidence: number };

/**
 * True when two lines are the same fact phrased twice.
 *
 * The topic-family test only runs *across* kinds: an AI strength about the
 * city and the "Same city" tag are one fact, but two catalog signals that both
 * mention "parivaar" are two different questions and must both survive.
 */
export function isNearDuplicate(a: Pick<Line, "kind" | "text">, b: Pick<Line, "kind" | "text">): boolean {
  if (a.text.trim().toLowerCase() === b.text.trim().toLowerCase()) return true;
  const ta = tokens(a.text);
  const tb = tokens(b.text);
  if (ta.size === 0 || tb.size === 0) return false;

  if (a.kind !== b.kind) {
    const fa = familiesOf(ta);
    const fb = familiesOf(tb);
    for (const f of fa) if (fb.has(f)) return true;
  }

  let common = 0;
  for (const w of ta) if (tb.has(w)) common++;
  return common / Math.min(ta.size, tb.size) >= 0.6;
}

/** Importance first, then evidence, then the order the lines arrived in (stable). */
function byImportance(lines: Line[]): Line[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.priority - b.line.priority || a.line.evidence - b.line.evidence || a.index - b.index)
    .map((x) => x.line);
}

function dedupe(lines: Line[]): Line[] {
  const kept: Line[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    const entry = { ...line, text };
    if (kept.some((k) => isNearDuplicate(k, entry))) continue;
    kept.push(entry);
  }
  return kept;
}

/** Label + the sentence compatibilityLab already cleared for display. */
function signalLine(d: CompatibilityDimension): string {
  return `${d.label} — ${d.detail}`;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), template);
}

function sochLines(fit: SochFit | null, t: Translate): string[] {
  if (!fit) return [];
  const out: string[] = [];
  if (fit.signalCommon >= MIN_COMMON_SIGNALS && fit.signalAgreed > 0) {
    out.push(
      fill(t("matchReel.why.sochSignals", "Zindagi ke {common} sawaalon me se {agreed} par ek jaisa jawab."), {
        common: fit.signalCommon,
        agreed: fit.signalAgreed,
      }),
    );
  }
  if (fit.pollCommon >= MIN_COMMON_POLLS && fit.pollAgreed > 0) {
    out.push(
      fill(t("matchReel.why.sochPolls", "Vibe polls me {common} me se {agreed} par same soch."), {
        common: fit.pollCommon,
        agreed: fit.pollAgreed,
      }),
    );
  }
  return out;
}

/**
 * The L1 labels worth naming when empty, most-decisive first. Read off the
 * facts list rather than the profile so this file never learns a field path.
 */
const NAMEABLE_GAPS: string[] = ["Relocation", "Parivaar ka prakar", "Kaam", "Shiksha", "Khaan-paan"];

/** Only what may be said to a stranger — the reel is pre-match. */
function publicDims(dims: CompatibilityDimension[] | undefined): CompatibilityDimension[] {
  return (dims ?? []).filter((d) => !d.candidateAnswerIsPrivate);
}

function dimLine(d: CompatibilityDimension): Line {
  return {
    kind: "signal",
    text: signalLine(d),
    priority: DIMENSION_PRIORITY[d.key] ?? DEFAULT_PRIORITY,
    evidence: EVIDENCE_RANK[d.evidence],
  };
}

export function buildWhyThisMatch(input: WhyThisMatchInput, t: Translate = noopT): WhyThisMatch {
  const { report, sochFit, strengths, sharedTags, preference, facts } = input;

  /* ── value connection: the strongest public, self-confirmed agreement ── */
  const alignedDims = publicDims(report?.aligned)
    .map((d, index) => ({ d, index }))
    .sort(
      (a, b) =>
        (DIMENSION_PRIORITY[a.d.key] ?? DEFAULT_PRIORITY) - (DIMENSION_PRIORITY[b.d.key] ?? DEFAULT_PRIORITY) ||
        EVIDENCE_RANK[a.d.evidence] - EVIDENCE_RANK[b.d.evidence] ||
        a.index - b.index,
    )
    .map((x) => x.d);
  const aligned = alignedDims.map(dimLine);
  const valueDim = alignedDims.find((d) => d.evidence === "high") ?? null;
  let valueConnection: string | null = null;
  if (valueDim) {
    valueConnection = fill(
      t("matchReel.why.valueSignal", "{label}: is par aap dono ki soch ek jaisi hai — dono ne khud bataya."),
      { label: valueDim.label },
    );
  } else if (sochFit && sochFit.mindsetCommon >= MIN_COMMON_MINDSET && sochFit.mindsetAgreed > 0) {
    valueConnection = fill(
      t("matchReel.why.valueMindset", "Soch: {common} me se {agreed} soch wale sawaal par ek jaisa jawab."),
      { common: sochFit.mindsetCommon, agreed: sochFit.mindsetAgreed },
    );
  }

  /* ── reasons: importance-ranked, facts and AI kept apart ──────────────── */
  const pool: Line[] = [];
  if (valueConnection) pool.push({ kind: "value", text: valueConnection, priority: 0, evidence: 0 });
  for (const line of aligned) if (!valueDim || line.text !== signalLine(valueDim)) pool.push(line);
  for (const text of sochLines(sochFit, t)) pool.push({ kind: "soch", text, priority: 6, evidence: 0 });
  for (const text of sharedTags) pool.push({ kind: "tag", text, priority: textPriority(text), evidence: 0 });
  for (const text of strengths) pool.push({ kind: "ai", text, priority: textPriority(text), evidence: 1 });
  if (preference.state === "COMPARABLE" && preference.score !== null && Math.round(preference.score) >= PREFERENCE_LINE_FLOOR) {
    pool.push({
      kind: "pref",
      text: fill(t("matchReel.why.preference", "Aapki batayi partner preferences se {score}% mel."), {
        score: Math.round(preference.score),
      }),
      priority: 3,
      evidence: 0,
    });
  }
  // The value connection sits in the pool only so nothing restates it — it is
  // its own slot, never one of the three reasons.
  const reasons: WhyReason[] = dedupe(byImportance(pool))
    .filter((l) => l.kind !== "value")
    .slice(0, MAX_REASONS)
    .map((l) => ({ text: l.text, kind: l.kind === "ai" ? "ai" : "fact" }));

  /* ── unclear: a public clash, a missing public answer, or an empty L1 field ── */
  let unclearDim: CompatibilityDimension | null = null;
  let unclear: string | null = null;
  const clash = publicDims(report?.discuss)[0] ?? null;
  const theirsMissing = publicDims(report?.unknown).find((d) => d.missing === "candidate") ?? null;
  const bothMissing = publicDims(report?.unknown).find((d) => d.missing === "both") ?? null;
  if (clash) {
    unclearDim = clash;
    unclear = fill(t("matchReel.why.unclearClash", "{label} — is par aap dono ka jawab alag hai; baat karke clear karein."), {
      label: clash.label,
    });
  } else if (theirsMissing) {
    unclearDim = theirsMissing;
    unclear = fill(t("matchReel.why.unclearTheirs", "{label} — is baat ki jaankari abhi nahi di gayi."), {
      label: theirsMissing.label,
    });
  } else if (bothMissing) {
    unclearDim = bothMissing;
    unclear = fill(t("matchReel.why.unclearBoth", "{label} — is par aap dono me se kisi ne abhi jawab nahi diya."), {
      label: bothMissing.label,
    });
  } else if (facts) {
    const present = new Set(facts.fields.map((f) => f.label));
    const gap = NAMEABLE_GAPS.find((label) => !present.has(label));
    if (gap) {
      unclear = fill(t("matchReel.why.unclearField", "{label} — is baat ki jaankari abhi nahi di gayi."), { label: gap });
    }
  }

  /* ── starter: ask the open question first, else build on the overlap ──── */
  let starter: string | null = null;
  const question = unclearDim?.suggestedQuestion ?? null;
  const hobby = sharedTags.find((tag) => tag.includes("hobby") || tag.includes("Common hobby"));
  const city = sharedTags.find((tag) => tag.includes("city") || tag.includes("Same city"));
  if (question) {
    starter = fill(t("matchReel.why.starterQuestion", "Seedha poochh lijiye — \"{question}\""), { question });
  } else if (hobby) {
    const name = hobby.split(":").slice(1).join(":").trim() || hobby;
    starter = fill(t("matchReel.why.starterHobby", "Aap dono ko {hobby} pasand hai — isi se baat shuru karein."), {
      hobby: name,
    });
  } else if (city) {
    const name = city.split(":").slice(1).join(":").trim() || city;
    starter = fill(
      t("matchReel.why.starterCity", "Aap dono {city} me hain — sheher ki koi pasandida jagah poochh lijiye."),
      { city: name },
    );
  } else if (valueDim) {
    starter = fill(
      t("matchReel.why.starterValue", "\"{label}\" par aap dono ek jaisa sochte hain — poochhiye ki unke liye ye kyun zaroori hai."),
      { label: valueDim.label },
    );
  } else if (strengths[0]) {
    starter = fill(t("matchReel.why.starterStrength", "Bataiye ki inki ye baat achhi lagi — {strength}"), {
      strength: strengths[0].replace(/[.।]\s*$/, ""),
    });
  }

  return { reasons, valueConnection, unclear, starter };
}
