import { noopT, type Translate } from "@/lib/i18n/translate";
import type { CompatibilityDimension, CompatibilityReport } from "./compatibilityLab";
import type { SochFit } from "./sochFit";
import type { CandidateFacts } from "./candidateFacts";

/**
 * "Why this match?" — the structured, deterministic layer under every reel card.
 *
 * Pure TypeScript: no prisma, no AI, no `server-only`. Same split and the same
 * reason as `compatibilityLab.ts` — the decision about *which* facts may be
 * called a reason has to be testable without a database and must never be
 * made by a model (D-32: AI explains, code decides).
 *
 * ## Eligibility, in priority order
 *
 *   1. Real signal agreements — `CompatibilityReport.aligned`, i.e. the same
 *      comparators the ranking already uses, banded STRONG_ALIGNMENT. Sorted
 *      self-confirmed first (`evidence: "high"`), then reports by a parent.
 *   2. Soch fit counts — `describeSochFit`-style "N me se M same", which the
 *      user could recount themselves.
 *   3. The AI's cached strengths (`DailyReelProfile.aiReasonText`, written once
 *      per daily reel) — already phrased, already visibility-safe (L1).
 *   4. Deterministic shared tags (same city / diet / hobby).
 *   5. A preference-score line, only when the score is genuinely high.
 *
 * Every slot that has nothing eligible stays `null`/empty. The UI renders
 * "Is baat par abhi information nahi hai." there — a guess is never made.
 *
 * ## Privacy
 *
 * Nothing here reads a raw answer. Signal lines reuse `CompatibilityDimension.detail`,
 * the one sentence `compatibilityLab.ts` already decided may be said out loud
 * (MATCH_PRIVATE values are never named there, so they cannot be named here).
 */

export interface WhyThisMatch {
  /** Up to 3 strongest fit reasons (Hinglish, one short line each). */
  reasons: string[];
  /** One confirmed quality/value connection, else null. */
  valueConnection: string | null;
  /** One REAL missing/unconfirmed/clashing topic, else null. */
  unclear: string | null;
  /** One conversation starter grounded in the lines above, else null. */
  starter: string | null;
}

export interface WhyThisMatchInput {
  candidateName: string;
  /** Null when either side's profile could not be compared. */
  report: CompatibilityReport | null;
  sochFit: SochFit | null;
  /** Cached AI strengths — never a fresh call. */
  strengths: string[];
  /** Deterministic viewer↔candidate overlap chips, as already shown on the card. */
  sharedTags: string[];
  /** 0..100 preference score from the persisted reel row. */
  preferenceScore: number;
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

type LineKind = "value" | "signal" | "soch" | "ai" | "tag" | "pref";
type Line = { kind: LineKind; text: string };

/**
 * True when two lines are the same fact phrased twice.
 *
 * The topic-family test only runs *across* kinds: an AI strength about the
 * city and the "Same city" tag are one fact, but two catalog signals that both
 * mention "parivaar" are two different questions and must both survive.
 */
export function isNearDuplicate(a: Line, b: Line): boolean {
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

function dedupe(lines: Line[]): Line[] {
  const kept: Line[] = [];
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    const entry = { kind: line.kind, text };
    if (kept.some((k) => isNearDuplicate(k, entry))) continue;
    kept.push(entry);
  }
  return kept;
}

function sortedByEvidence(dims: CompatibilityDimension[]): CompatibilityDimension[] {
  return [...dims].sort((a, b) => EVIDENCE_RANK[a.evidence] - EVIDENCE_RANK[b.evidence]);
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

export function buildWhyThisMatch(input: WhyThisMatchInput, t: Translate = noopT): WhyThisMatch {
  const { report, sochFit, strengths, sharedTags, preferenceScore, facts } = input;
  /* ── value connection: the strongest self-confirmed agreement ────────── */
  const aligned = sortedByEvidence(report?.aligned ?? []);
  const confirmed = aligned.find((d) => d.evidence === "high");
  let valueDim: CompatibilityDimension | null = null;
  let valueConnection: string | null = null;
  if (confirmed) {
    valueDim = confirmed;
    valueConnection = fill(
      t("matchReel.why.valueSignal", "{label}: is par aap dono ki soch ek jaisi hai — dono ne khud bataya."),
      { label: confirmed.label },
    );
  } else if (sochFit && sochFit.mindsetCommon >= MIN_COMMON_MINDSET && sochFit.mindsetAgreed > 0) {
    valueConnection = fill(
      t("matchReel.why.valueMindset", "Soch: {common} me se {agreed} soch wale sawaal par ek jaisa jawab."),
      { common: sochFit.mindsetCommon, agreed: sochFit.mindsetAgreed },
    );
  }

  /* ── reasons: real signals → soch counts → cached AI → tags → preference ── */
  const pool: Line[] = [];
  if (valueConnection) pool.push({ kind: "value", text: valueConnection });
  for (const d of aligned) if (d !== valueDim) pool.push({ kind: "signal", text: signalLine(d) });
  for (const text of sochLines(sochFit, t)) pool.push({ kind: "soch", text });
  for (const text of strengths) pool.push({ kind: "ai", text });
  for (const text of sharedTags) pool.push({ kind: "tag", text });
  if (Math.round(preferenceScore) >= PREFERENCE_LINE_FLOOR) {
    pool.push({
      kind: "pref",
      text: fill(t("matchReel.why.preference", "Aapki batayi partner preferences se {score}% mel."), {
        score: Math.round(preferenceScore),
      }),
    });
  }
  // The value connection sits in the pool only so nothing restates it — it is
  // its own slot, never one of the three reasons.
  const reasons = dedupe(pool)
    .filter((l) => l.kind !== "value")
    .slice(0, MAX_REASONS)
    .map((l) => l.text);

  /* ── unclear: a real clash, a missing answer, or an empty L1 field ─────── */
  let unclearDim: CompatibilityDimension | null = null;
  let unclear: string | null = null;
  const clash = report?.discuss[0] ?? null;
  const theirsMissing = report?.unknown.find((d) => d.missing === "candidate") ?? null;
  const bothMissing = report?.unknown.find((d) => d.missing === "both") ?? null;
  if (clash) {
    unclearDim = clash;
    unclear = fill(t("matchReel.why.unclearClash", "{label} — is par aap dono ka jawab alag hai; baat karke clear karein."), {
      label: clash.label,
    });
  } else if (theirsMissing) {
    unclearDim = theirsMissing;
    unclear = fill(t("matchReel.why.unclearTheirs", "{label} — unhone abhi confirm nahi kiya hai."), {
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
      unclear = fill(t("matchReel.why.unclearField", "{label} — unhone profile me abhi nahi bataya hai."), { label: gap });
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
