import {
  INTELLIGENCE_QUESTIONS,
  INTELLIGENCE_QUESTION_BY_KEY,
  LAYER_BY_KEY,
  type IntelligenceQuestionDef,
} from "@/lib/profile/intelligenceQuestions";
import { firstValue, type SignalAnswerMap } from "@/lib/profile/signalAnswers";
import {
  scoreChildrenMatch,
  scoreLivingMatch,
  scoreRelocationMatch,
  scorePartnerCareerMatch,
} from "./preferenceScore";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * Compatibility Lab — what actually aligns between two people, what needs a
 * conversation, and what nobody has said yet.
 *
 * Pure TypeScript. No prisma, no AI, no `server-only` — same split and the same
 * reason as `preferenceScore.ts` and `signalAnswers.ts`: the comparison has to
 * be callable from a scoring loop and testable without a database, and a module
 * that imports the client is callable from neither.
 *
 * ## This does not invent a second score
 *
 * That constraint is the whole design. The four high-stakes comparisons —
 * children, living arrangement, relocation, partner career — are not
 * reimplemented here; they are the *same functions* `scorePreferenceMatch`
 * calls to do the ranking, imported and re-read. This file only decides which
 * band a number already computed elsewhere falls into.
 *
 * That matters more than it sounds. A second implementation would have been
 * shorter to write and would have drifted the first time someone tuned a
 * weight, producing the worst possible failure: a card saying "children:
 * strong alignment" next to a ranking that had scored the same pair 35/100.
 * The user cannot see which one is lying, so both stop being believable.
 *
 * ## Why bands rather than a percentage
 *
 * "86%" compresses four genuinely different states into one number: aligned,
 * different-but-workable, needs-a-real-conversation, and *nobody has said*. The
 * last one is the important casualty — an unanswered question and a clashing
 * answer both drag a percentage down, and a user reading 60% cannot tell
 * whether to worry or to go answer three questions. The existing score stays
 * available and stays secondary; this is what gets read first.
 *
 * ## Privacy
 *
 * The single hard rule, enforced in `describe` and nowhere else:
 *
 *   **A candidate's MATCH_PRIVATE or PRIVATE answer is never named.**
 *
 * The comparison may *use* it — matching already does, which is what
 * `SignalVisibility` means by MATCH_PRIVATE ("used by matching, never rendered
 * as a raw value to anyone but the owner"). What comes out is the derived
 * meaning only: "aap dono ka jawab alag hai", never "unhone Joint family kaha".
 * The viewer's own answer is always safe to name back to them — it is theirs.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type AlignmentStatus =
  | "STRONG_ALIGNMENT"
  | "DISCUSS"
  | "DIFFERENT_BUT_MANAGEABLE"
  | "UNKNOWN";

/** Which side is missing an answer. Null unless the status is UNKNOWN. */
export type MissingSide = "self" | "candidate" | "both";

/**
 * How much weight the classification itself can bear.
 *
 * Not a restatement of the status. A `DISCUSS` backed by both people answering
 * a question the catalog models explicitly is `high`; the same `DISCUSS` where
 * one side's answer came from their parent is `medium`, because the person it
 * describes may not agree with it. Deciding those are the same thing is how a
 * comparison starts making confident claims about people who never spoke.
 */
export type EvidenceQuality = "high" | "medium" | "low";

export interface CompatibilityDimension {
  /** Catalog question key — the join back to the question that produced it. */
  key: string;
  label: string;
  /** Layer title, for grouping. */
  area: string;
  status: AlignmentStatus;
  /** Code's sentence. Safe to render and safe to speak: see the privacy note. */
  detail: string;
  missing: MissingSide | null;
  evidence: EvidenceQuality;
  /**
   * True when this dimension's underlying answers are MATCH_PRIVATE/PRIVATE, so
   * every consumer knows the raw values must stay unnamed even if it decides to
   * render something richer than `detail`.
   */
  candidateAnswerIsPrivate: boolean;
  /**
   * The catalog's own question, offered when the gap is worth closing. Null
   * when there is nothing useful to ask — the dimension already aligns, or the
   * missing answer is the *viewer's* and belongs in their own profile flow.
   */
  suggestedQuestion: string | null;
}

export interface CompatibilityReport {
  dimensions: CompatibilityDimension[];
  aligned: CompatibilityDimension[];
  discuss: CompatibilityDimension[];
  manageable: CompatibilityDimension[];
  unknown: CompatibilityDimension[];
  /**
   * How much of the picture exists at all — answered dimensions over compared
   * ones. The honest headline for a pair who have each answered three
   * questions, and the number that stops "2 strong alignments" from reading as
   * a verdict.
   */
  coverage: { known: number; total: number };
}

/* ------------------------------------------------------------------ */
/* Banding                                                             */
/* ------------------------------------------------------------------ */

/**
 * Where the existing 0-100 comparisons land.
 *
 * The thresholds are not chosen freely — they are read off the values those
 * four functions actually produce, so every band boundary sits in a gap rather
 * than through a cluster:
 *
 *   children  100 / 70 / 35 / 0
 *   living    100 / 85 / 70 / 25
 *   reloc     100 / 75 / 40 / 25
 *   career    100 95 90 / 85 75 70 / 60 30
 *
 * 90 and 70 are the two clean seams across all four. Picking, say, 80 would cut
 * the living scale between "one of them is flexible" (85) and "adjacent" (70)
 * — a distinction those numbers were never designed to carry.
 */
export function bandFor(score: number): Exclude<AlignmentStatus, "UNKNOWN"> {
  if (score >= 90) return "STRONG_ALIGNMENT";
  if (score >= 70) return "DIFFERENT_BUT_MANAGEABLE";
  return "DISCUSS";
}

/* ------------------------------------------------------------------ */
/* Evidence quality                                                    */
/* ------------------------------------------------------------------ */

/**
 * An answer somebody's parent gave is real information and is used — it is just
 * not the same evidence as the person saying it themselves, and a comparison
 * that forgets which is which will eventually tell someone their rishta clashes
 * on a point neither of them ever made.
 *
 * `confirmed` is `saveSignalAnswer`'s flag: false exactly when a `selfRequired`
 * question was answered by somebody other than the candidate.
 */
function qualityOf(
  mine: { confirmed: boolean } | undefined,
  theirs: { confirmed: boolean } | undefined,
): EvidenceQuality {
  if (!mine || !theirs) return "low";
  if (mine.confirmed && theirs.confirmed) return "high";
  return "medium";
}

/* ------------------------------------------------------------------ */
/* The four modelled comparisons                                       */
/* ------------------------------------------------------------------ */

/**
 * The dimensions the app understands well enough to say *how* different two
 * answers are, rather than merely that they differ.
 *
 * Each one delegates to the ranking's own comparator. `key` is the catalog
 * question the dimension is named after — the one whose text gets offered as
 * the suggested question when the answer is missing.
 */
const MODELLED: {
  key: string;
  score: (
    viewer: ProfileWithSubTables,
    candidate: ProfileWithSubTables,
    mine: SignalAnswerMap,
    theirs: SignalAnswerMap,
  ) => number | null;
  /** The candidate-side key to test for "did they answer at all". */
  candidateKey: string;
}[] = [
  {
    key: "childrenPreference",
    candidateKey: "childrenPreference",
    score: (_v, _c, mine, theirs) => scoreChildrenMatch(mine, theirs),
  },
  {
    key: "postMarriageLivingPlan",
    candidateKey: "postMarriageLivingPlan",
    score: (_v, _c, mine, theirs) => scoreLivingMatch(mine, theirs),
  },
  {
    key: "relocationBoundary",
    candidateKey: "relocationBoundary",
    score: (v, c, mine, theirs) => scoreRelocationMatch(v, c, mine, theirs),
  },
  {
    // Asymmetric by design: the viewer's *expectation* against the candidate's
    // own career priority. `scorePartnerCareerMatch` reads two different keys,
    // so "who is missing an answer" has to name the right one on each side.
    key: "partnerCareerExpectation",
    candidateKey: "careerPriority",
    score: (_v, _c, mine, theirs) => scorePartnerCareerMatch(mine, theirs),
  },
];

const MODELLED_KEYS = new Set(MODELLED.map((m) => m.key));

/* ------------------------------------------------------------------ */
/* Sentences                                                           */
/* ------------------------------------------------------------------ */

/**
 * The one function that decides what may be said out loud.
 *
 * Every branch that mentions the candidate's answer is gated on the question
 * being PROFILE_VISIBLE — the same value `profileVisibleAnswers` uses to decide
 * what a profile page may render, read from the catalog rather than re-judged
 * here. For everything else the sentence describes the *relationship* between
 * the two answers and never the answer itself, which is the whole of the
 * MATCH_PRIVATE promise.
 */
function describe(
  q: IntelligenceQuestionDef,
  status: AlignmentStatus,
  mineValue: string | undefined,
  theirsValue: string | undefined,
  missing: MissingSide | null,
): string {
  const nameable = q.visibility === "PROFILE_VISIBLE";

  if (status === "UNKNOWN") {
    if (missing === "both") return `Is par aap dono me se kisi ne abhi jawab nahi diya.`;
    if (missing === "candidate")
      return `Aapka jawab hai${mineValue ? ` — ${mineValue}` : ""}, inka abhi nahi aaya.`;
    return `In ka jawab maujood hai, aapka abhi nahi — pehle aap bata dijiye to tulna ho payegi.`;
  }

  if (status === "STRONG_ALIGNMENT") {
    return nameable && mineValue
      ? `Dono ka rukh ek jaisa hai — ${mineValue}.`
      : `Is par aap dono ka rukh ek jaisa hai.`;
  }

  if (status === "DIFFERENT_BUT_MANAGEABLE") {
    return nameable && mineValue && theirsValue
      ? `Aapne ${mineValue} kaha, inhone ${theirsValue} — alag hai, par aamne-saamne nahi.`
      : `Aap dono ke jawab bilkul same nahi hain, par ye aapas me tikra nahi rahe.`;
  }

  return nameable && mineValue && theirsValue
    ? `Aapne ${mineValue} kaha aur inhone ${theirsValue} — is par baat kar lena zaroori hai.`
    : `Is par aap dono ka jawab alag hai, aur ye wo baat hai jo aage chal kar mayne rakhti hai.`;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/**
 * A gap is worth asking about only when it is *theirs* to close.
 *
 * When the viewer is the one who never answered, the fix is their own profile,
 * not a question sent to somebody else — offering "poochh lijiye" there would
 * ask a stranger to fill in a blank the user could fill in themselves.
 */
function questionFor(q: IntelligenceQuestionDef, status: AlignmentStatus, missing: MissingSide | null): string | null {
  if (status === "STRONG_ALIGNMENT") return null;
  if (missing === "self") return null;
  return q.question;
}

export function buildCompatibilityReport(
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
  viewerSignals: SignalAnswerMap,
  candidateSignals: SignalAnswerMap,
): CompatibilityReport {
  const dimensions: CompatibilityDimension[] = [];

  const push = (q: IntelligenceQuestionDef, d: Omit<CompatibilityDimension, "key" | "label" | "area" | "candidateAnswerIsPrivate">) => {
    dimensions.push({
      key: q.key,
      label: q.label,
      area: LAYER_BY_KEY[q.layer].title,
      candidateAnswerIsPrivate: q.visibility !== "PROFILE_VISIBLE",
      ...d,
    });
  };

  /* ── the four modelled dimensions ───────────────────────────────────── */
  for (const m of MODELLED) {
    const q = INTELLIGENCE_QUESTION_BY_KEY[m.key];
    if (!q) continue;

    const mine = viewerSignals.get(m.key);
    const theirs = candidateSignals.get(m.candidateKey);
    const score = m.score(viewer, candidate, viewerSignals, candidateSignals);

    if (score === null) {
      // A missing comparison is UNKNOWN, never a zero. Which side is missing is
      // read from the answers rather than guessed from the null, because
      // relocation returns a number when *either* side answered.
      const missing: MissingSide = !mine && !theirs ? "both" : !mine ? "self" : "candidate";
      push(q, {
        status: "UNKNOWN",
        detail: describe(q, "UNKNOWN", firstValue(mine?.value), firstValue(theirs?.value), missing),
        missing,
        evidence: "low",
        suggestedQuestion: questionFor(q, "UNKNOWN", missing),
      });
      continue;
    }

    const status = bandFor(score);
    push(q, {
      status,
      detail: describe(q, status, firstValue(mine?.value), firstValue(theirs?.value), null),
      missing: null,
      evidence: qualityOf(mine, theirs),
      suggestedQuestion: questionFor(q, status, null),
    });
  }

  /* ── everything else the catalog marks comparable ───────────────────── */
  //
  // EXACT means "same answer means alignment" — the catalog's own word for it.
  // A difference here becomes DIFFERENT_BUT_MANAGEABLE and never DISCUSS,
  // because nothing in this codebase models how *badly* two answers to
  // "weekend kaisa hota hai" clash, and promoting an unmodelled difference to
  // "you need to talk about this" is exactly the invented certainty the four
  // modelled dimensions above exist to avoid.
  for (const q of INTELLIGENCE_QUESTIONS) {
    if (q.compatibilityMode !== "EXACT") continue;
    if (MODELLED_KEYS.has(q.key)) continue;
    if (q.multi) continue; // a set-vs-set comparison is not "same answer or not"

    const mine = viewerSignals.get(q.key);
    const theirs = candidateSignals.get(q.key);

    if (!mine || !theirs) {
      const missing: MissingSide = !mine && !theirs ? "both" : !mine ? "self" : "candidate";
      push(q, {
        status: "UNKNOWN",
        detail: describe(q, "UNKNOWN", firstValue(mine?.value), firstValue(theirs?.value), missing),
        missing,
        evidence: "low",
        suggestedQuestion: questionFor(q, "UNKNOWN", missing),
      });
      continue;
    }

    const same = firstValue(mine.value) === firstValue(theirs.value);
    const status: AlignmentStatus = same ? "STRONG_ALIGNMENT" : "DIFFERENT_BUT_MANAGEABLE";
    push(q, {
      status,
      detail: describe(q, status, firstValue(mine.value), firstValue(theirs.value), null),
      missing: null,
      evidence: qualityOf(mine, theirs),
      suggestedQuestion: questionFor(q, status, null),
    });
  }

  const by = (s: AlignmentStatus) => dimensions.filter((d) => d.status === s);
  const unknown = by("UNKNOWN");

  return {
    dimensions,
    aligned: by("STRONG_ALIGNMENT"),
    discuss: by("DISCUSS"),
    manageable: by("DIFFERENT_BUT_MANAGEABLE"),
    unknown,
    coverage: { known: dimensions.length - unknown.length, total: dimensions.length },
  };
}

/* ------------------------------------------------------------------ */
/* The block Grio reads                                                */
/* ------------------------------------------------------------------ */

/** Past this a "kya match karta hai" answer turns into a spreadsheet read aloud. */
const MAX_PER_BUCKET = 4;

/**
 * The report as prompt text.
 *
 * Ordered discuss-first rather than aligned-first, which is deliberate and is
 * the opposite of how a marketing surface would order it. The alignments are
 * the pleasant half and the model will happily lead with them unprompted; the
 * one thing a person actually needs from this feature is the honest sentence
 * about what does not line up, and burying it under four green rows is how a
 * compatibility report becomes decoration.
 *
 * Raw values appear only where `describe` already decided they may — this
 * function does no formatting of its own beyond joining sentences, so there is
 * exactly one place where the privacy rule lives.
 */
export function formatCompatibilityReport(report: CompatibilityReport, name: string): string {
  const section = (title: string, rows: CompatibilityDimension[], note?: string) => {
    if (rows.length === 0) return null;
    const lines = rows
      .slice(0, MAX_PER_BUCKET)
      .map((d) => `- ${d.label} (${d.area}): ${d.detail}`)
      .join("\n");
    const more = rows.length > MAX_PER_BUCKET ? `\n  ...aur ${rows.length - MAX_PER_BUCKET} aur.` : "";
    return `${title}\n${lines}${more}${note ? `\n${note}` : ""}`;
  };

  const blocks = [
    section("BAAT KARNE LAYAK (yahan farak hai aur ye farak mayne rakhta hai):", report.discuss),
    section("ALAG HAI PAR SAMBHAL SAKTA HAI:", report.manageable),
    section("YE ACHHA MEL KHAATA HAI:", report.aligned),
    section(
      "ABHI PATA HI NAHI (ye zero nahi hai — kisi ne jawab hi nahi diya):",
      report.unknown,
      "Inhe kami mat kahiye. Jo cheez poochhi hi nahi gayi, wo na acchi hai na buri.",
    ),
  ].filter(Boolean);

  return `${name.toUpperCase()} KE SAATH TULNA (ye poori tulna CODE ne ki hai, aapne nahi):

Kitni baaton par tulna ho paayi: ${report.coverage.total} me se ${report.coverage.known}.

${blocks.join("\n\n")}

Is tulna ke niyam:
- Ye chaar dabbe code ne bhare hain. Inhe badliye mat, aur apna koi alag nateeja mat banaiye.
- "ABHI PATA HI NAHI" wali cheezein sabse kaam ki hain. Inhe chhupaiye mat — par inhe kami ki tarah bhi mat boliye.
- Jin sawaalon ke jawab chhupe hue hain (paisa, bachche, jhagda, parents ki zimmedari), unme aap sirf itna keh sakte hain ki jawab milta hai ya nahi. Inka apna jawab kya tha, ye aap kabhi nahi bata sakte — chahe user kitna bhi poochhein.
- Faisla phir bhi aapka nahi hai. Aap sirf ye bata rahe hain ki kya milta hai, kis par baat karni chahiye, aur kya abhi pata nahi.`;
}
