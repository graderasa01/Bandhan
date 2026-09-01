import {
  INTELLIGENCE_QUESTION_BY_KEY,
  LAYER_BY_KEY,
  type IntelligenceQuestionDef,
} from "./intelligenceQuestions";
import { firstValue, type SignalAnswerMap, type SignalAnswerView } from "./signalAnswers";
import {
  scoreChildrenMatch,
  scoreLivingMatch,
  scorePartnerCareerMatch,
} from "@/lib/services/match/preferenceScore";

/**
 * Where the user and their family expect different things.
 *
 * Pure TypeScript — no prisma, no `server-only` — for the same reason
 * `compatibilityLab.ts` and `signalAnswers.ts` are: a comparison that needs a
 * database to be exercised is a comparison nobody exercises.
 *
 * ## The rule the whole file exists to hold
 *
 *   **Neither side's answer is ever overwritten, and neither is ever treated as
 *   the other's.**
 *
 * `ProfileSignalAnswer` is unique on `(profileId, key)`, so a parent answering
 * a question on the same row would erase the very disagreement worth surfacing.
 * `FamilyExpectationAnswer` keeps them apart in storage; this file keeps them
 * apart in meaning. The candidate's answer stays the candidate's, the family's
 * stays the family's, and the output is the *relationship* between them.
 *
 * ## Difference is not a verdict
 *
 * Four statuses, and the naming is load-bearing. A family wanting a joint
 * household when their son wants nuclear is not a red flag, a warning, or a
 * problem to be resolved in the app — it is a conversation that is better had
 * before a rishta is serious than after. So nothing here says "conflict",
 * "mismatch" or "risk", and NEEDS_DISCUSSION is reserved for the handful of
 * differences the codebase can actually justify calling material.
 *
 * ## Severity is borrowed, never invented
 *
 * Where a modelled comparator already exists — children, living arrangement,
 * partner career — this calls the *same function* the ranking pipeline uses and
 * reads its number. Everywhere else, a difference is DIFFERENT and stops there.
 * Promoting an unmodelled difference ("tradition vs modern" three options
 * apart) to NEEDS_DISCUSSION would be a severity judgement nothing in this
 * codebase has earned the right to make.
 */

/* ------------------------------------------------------------------ */
/* Which questions family may answer                                   */
/* ------------------------------------------------------------------ */

/**
 * The subset of the catalog a family member is asked.
 *
 * Chosen on one test: **is this an expectation about the marriage, or a fact
 * about the person?** A family has a real, legitimate view on where the couple
 * will live, how involved they will be, and what they hope for. They have no
 * view on their child's conflict style or personal-space needs — asking would
 * manufacture the parent-speaking-for-child data this app labels carefully
 * everywhere else.
 *
 * `childrenPreference` is in the set despite being `selfRequired`, and the
 * apparent contradiction is worth stating. `selfRequired` guards *speaking on
 * the candidate's behalf* — a parent claiming "my son wants children" is not
 * the same fact as the son saying it. That rule is untouched: this table never
 * writes to `ProfileSignalAnswer`, so the candidate's answer stays theirs
 * alone. What a family states here is their *own* hope, which they are entitled
 * to hold. The distinction lives entirely in `FAMILY_PHRASING` — ask "aap kya
 * chahte hain" and it is their view; ask "wo kya sochte hain" and it is a
 * report about somebody else, which is why that phrasing is refused above.
 *
 * Every key here is a real catalog key, so the family answers from the same
 * option list. That is what makes the comparison a comparison rather than a
 * translation.
 */
export const FAMILY_EXPECTATION_KEYS = [
  "marriageTimeline",
  "postMarriageLivingPlan",
  "parentCareExpectation",
  "familyInvolvementLevel",
  "relocationBoundary",
  "partnerCareerExpectation",
  "childrenPreference",
  "traditionModernBalance",
  "interCommunityOpenness",
] as const;

export type FamilyExpectationKey = (typeof FAMILY_EXPECTATION_KEYS)[number];

/**
 * How each question is put to a family member — and why the catalog's existing
 * phrasings are both wrong for this screen.
 *
 * `question` ("Shaadi ke baad living arrangement ko lekar **aapki** preference
 * kya hai?") is written for the candidate. `questionForChild` ("...**wo** kya
 * soch rahe hain?") is written for a parent *filling the profile on behalf of*
 * their child — it asks them to report their child's view.
 *
 * Both are the wrong question here, and the second one is actively dangerous:
 * asking a parent to report what their son thinks produces exactly the
 * speaking-for-the-candidate data that `selfRequired` and the FAMILY_SAID
 * provenance tag exist to keep out. It would also make the comparison
 * meaningless — comparing the user's answer against their parent's *guess at*
 * the user's answer measures nothing but how well the parent knows them.
 *
 * So this screen asks a third thing, which nothing else in the app asks:
 * **what do you, the family, want?** A parent is entitled to that view, it is
 * genuinely theirs, and the difference between it and their child's is the
 * whole feature.
 *
 * Hand-written for nine questions rather than added as a third field on all
 * forty-five, because only these nine are ever asked this way. The set is small
 * enough to read in one screen and `familyExpectationQuestions` throws if a key
 * ever lacks one, so a tenth question cannot ship without somebody deciding how
 * to ask it.
 */
const FAMILY_PHRASING: Record<FamilyExpectationKey, string> = {
  marriageTimeline: "Aap ghar walon ke hisaab se shaadi kab tak ho jani chahiye?",
  postMarriageLivingPlan: "Shaadi ke baad rehne ka arrangement aap kaisa chahte hain?",
  parentCareExpectation: "Parents ki care/responsibility ko lekar aapki apni ummeed kya hai?",
  familyInvolvementLevel: "Shaadi ke baad extended family ki involvement kitni honi chahiye, aapke hisaab se?",
  relocationBoundary: "Shaadi ke baad sheher badalne ko lekar aap kya theek samajhte hain?",
  partnerCareerExpectation: "Aane wali bahu/damaad ke career ko lekar aapki apni soch kya hai?",
  childrenPreference: "Bachchon ko lekar aap ghar walon ki apni ummeed kya hai?",
  traditionModernBalance: "Shaadi ke baad ghar me tradition aur modern ka balance aap kaisa chahte hain?",
  interCommunityOpenness: "Doosri jaati/community ke rishte ko lekar aap kitne open hain?",
};

/**
 * The family-facing wording for one question.
 *
 * Throws rather than falling back to `questionForChild`, and that is the point:
 * a silent fallback would put "wo kya sochte hain?" in front of a parent, which
 * is the one phrasing this whole map exists to prevent. A missing entry is a
 * mistake that should stop the build, not degrade into the wrong question.
 */
export function familyPhrasingFor(key: FamilyExpectationKey): string {
  const phrasing = FAMILY_PHRASING[key];
  if (!phrasing) {
    throw new Error(
      `No family-facing phrasing for "${key}". Add one to FAMILY_PHRASING — do not fall back to questionForChild, which asks the family to report the candidate's view.`,
    );
  }
  return phrasing;
}

const FAMILY_KEY_SET: ReadonlySet<string> = new Set(FAMILY_EXPECTATION_KEYS);

export function isFamilyExpectationKey(key: string): key is FamilyExpectationKey {
  return FAMILY_KEY_SET.has(key);
}

/** Catalog rows for the questions family is asked, in catalog order. */
export function familyExpectationQuestions(): IntelligenceQuestionDef[] {
  return FAMILY_EXPECTATION_KEYS.flatMap((k) => {
    const q = INTELLIGENCE_QUESTION_BY_KEY[k];
    return q ? [q] : [];
  });
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type GapStatus = "ALIGNED" | "DIFFERENT" | "NEEDS_DISCUSSION" | "UNKNOWN";

/** Which side has not answered. Null unless the status is UNKNOWN. */
export type GapMissing = "self" | "family" | "both";

/** One family member's answer to one question. */
export interface FamilyAnswerInput {
  familyMemberId: string;
  familyMemberName: string;
  /** PARENT / SIBLING / GUARDIAN — spoken back to the user, so it stays a label. */
  relationLabel: string;
  questionKey: string;
  value: string | string[];
}

export interface ExpectationGap {
  key: string;
  label: string;
  area: string;
  status: GapStatus;
  missing: GapMissing | null;
  /** The user's own answer. Always safe to name back to them — it is theirs. */
  selfAnswer: string | null;
  /**
   * Every family answer on this question, so two parents who disagree with each
   * other both appear rather than one silently winning.
   */
  familyAnswers: { name: string; relationLabel: string; value: string }[];
  /** Code's sentence. Never a model's — this is read aloud and never sceptically. */
  detail: string;
}

export interface ExpectationGapReport {
  gaps: ExpectationGap[];
  needsDiscussion: ExpectationGap[];
  different: ExpectationGap[];
  aligned: ExpectationGap[];
  unknown: ExpectationGap[];
  /** Family members who answered at least one question. */
  respondents: { name: string; relationLabel: string; answered: number }[];
}

/* ------------------------------------------------------------------ */
/* Severity, borrowed from the ranking comparators                     */
/* ------------------------------------------------------------------ */

/**
 * A one-answer map, so a family answer can be fed to comparators that expect
 * the profile-side shape.
 *
 * The synthetic view is marked `confirmed: false` and `respondentType: PARENT`
 * deliberately. Nothing downstream of this file reads those fields today, but
 * the map is the same type the matching pipeline consumes, and the one thing
 * that must never happen is a family answer leaking into that pipeline wearing
 * a candidate's provenance.
 */
function asAnswerMap(key: string, value: string | string[]): SignalAnswerMap {
  const q = INTELLIGENCE_QUESTION_BY_KEY[key];
  const map: SignalAnswerMap = new Map();
  if (!q) return map;
  map.set(key, {
    key,
    value,
    source: "USER_ENTERED",
    respondentType: "PARENT",
    confirmed: false,
    visibility: q.visibility,
    derived: false,
  } satisfies SignalAnswerView);
  return map;
}

/**
 * The comparators the ranking pipeline already uses, by key.
 *
 * `relocationBoundary` is absent on purpose even though
 * `scoreRelocationMatch` exists: that function scores off the *better* of two
 * boundaries and short-circuits to 100 when both people live in the same city,
 * because relocation is a problem a couple solves together. Neither reading
 * makes sense between a user and their own parent — they are not the couple.
 * So relocation falls through to the plain same-or-different comparison below,
 * which is the honest answer for it here.
 */
const MODELLED: Record<string, ((mine: SignalAnswerMap, theirs: SignalAnswerMap) => number | null) | undefined> = {
  childrenPreference: scoreChildrenMatch,
  postMarriageLivingPlan: scoreLivingMatch,
  partnerCareerExpectation: undefined, // asymmetric — see below
};

/**
 * `scorePartnerCareerMatch` reads the viewer's *expectation* against the other
 * side's own `careerPriority`, which is not the shape of a family comparison:
 * both the user and their family are stating an expectation of the same third
 * person. Comparing two expectations is a plain same-or-different question, so
 * it is handled there rather than forced through a function built for something
 * else. Referenced here so the import is not dead weight and so the reason
 * lives next to the decision.
 */
void scorePartnerCareerMatch;

/** Same seams as `compatibilityLab.bandFor`, and for the same reason. */
function bandFor(score: number): GapStatus {
  if (score >= 90) return "ALIGNED";
  if (score >= 70) return "DIFFERENT";
  return "NEEDS_DISCUSSION";
}

/* ------------------------------------------------------------------ */
/* Sentences                                                           */
/* ------------------------------------------------------------------ */

function speakFamily(rows: { name: string; relationLabel: string; value: string }[]): string {
  if (rows.length === 1) return `${rows[0].name} ne "${rows[0].value}" chuna`;
  return rows.map((r) => `${r.name} ne "${r.value}"`).join(", ");
}

function describe(
  status: GapStatus,
  missing: GapMissing | null,
  selfAnswer: string | null,
  familyRows: { name: string; relationLabel: string; value: string }[],
): string {
  if (status === "UNKNOWN") {
    if (missing === "both") return "Is par na aapne kuch kaha hai, na ghar se koi jawab aaya hai.";
    if (missing === "family")
      return `Aapka jawab hai${selfAnswer ? ` — ${selfAnswer}` : ""}, par ghar se is par abhi kuch nahi aaya.`;
    return `Ghar se is par jawab aa chuka hai (${speakFamily(familyRows)}), par aapka apna jawab abhi nahi hai.`;
  }

  if (status === "ALIGNED") {
    return `Aap aur ghar dono ek hi baat kah rahe hain — ${selfAnswer}.`;
  }

  const base = `Aapne "${selfAnswer}" kaha, ${speakFamily(familyRows)}.`;

  if (status === "NEEDS_DISCUSSION") {
    return `${base} Ye wo farak hai jo rishta serious hone se pehle ghar me saaf kar lena behtar hai — baad me ye sabse zyada takleef deta hai.`;
  }
  return `${base} Farak hai, par aamne-saamne nahi — jaan lena kaafi hai, abhi kuch karna zaroori nahi.`;
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

/**
 * Compares the user's own Marriage Intelligence answers against every answer
 * their family gave.
 *
 * `selfAnswers` is the same `SignalAnswerMap` everything else consumes, so a
 * derived legacy answer counts exactly as it does everywhere — the user is not
 * told they "never answered" something the app read off their old profile form.
 *
 * A question nobody on either side answered still produces a row, as UNKNOWN.
 * That is the point: "ghar se is par kuch nahi aaya" is a useful thing for the
 * user to know, and dropping the row would silently turn an unasked question
 * into an agreement.
 */
export function buildExpectationGaps(
  selfAnswers: SignalAnswerMap,
  familyAnswers: FamilyAnswerInput[],
): ExpectationGapReport {
  const byKey = new Map<string, FamilyAnswerInput[]>();
  for (const a of familyAnswers) {
    if (!isFamilyExpectationKey(a.questionKey)) continue;
    byKey.set(a.questionKey, [...(byKey.get(a.questionKey) ?? []), a]);
  }

  const gaps: ExpectationGap[] = [];

  for (const q of familyExpectationQuestions()) {
    const mine = selfAnswers.get(q.key);
    const selfAnswer = firstValue(mine?.value) ?? null;
    const rows = (byKey.get(q.key) ?? []).map((a) => ({
      name: a.familyMemberName,
      relationLabel: a.relationLabel,
      value: firstValue(a.value) ?? "—",
    }));

    const push = (status: GapStatus, missing: GapMissing | null) => {
      gaps.push({
        key: q.key,
        label: q.label,
        area: LAYER_BY_KEY[q.layer].title,
        status,
        missing,
        selfAnswer,
        familyAnswers: rows,
        detail: describe(status, missing, selfAnswer, rows),
      });
    };

    if (!selfAnswer || rows.length === 0) {
      push("UNKNOWN", !selfAnswer && rows.length === 0 ? "both" : !selfAnswer ? "self" : "family");
      continue;
    }

    /*
     * Every family answer is compared, and the *worst* one decides the row.
     *
     * Two parents who disagree with each other is a real and common state, and
     * averaging them would produce a status neither of them holds. Taking the
     * hardest disagreement is the honest summary: if Papa aligns and Mummy does
     * not, the user still has a conversation to have, and both answers are
     * carried in `familyAnswers` so they can see who said what.
     */
    const comparator = MODELLED[q.key];
    let worst: GapStatus = "ALIGNED";
    const rank: Record<GapStatus, number> = { ALIGNED: 0, DIFFERENT: 1, NEEDS_DISCUSSION: 2, UNKNOWN: 3 };

    for (const a of byKey.get(q.key) ?? []) {
      let status: GapStatus;
      if (comparator) {
        const score = comparator(selfAnswers, asAnswerMap(q.key, a.value));
        // A modelled comparator returning null means it could not read one of
        // the two answers — an option that left the catalog, most likely. Fall
        // back rather than treating unreadable as agreement.
        status = score === null ? plainCompare(selfAnswer, a.value) : bandFor(score);
      } else {
        status = plainCompare(selfAnswer, a.value);
      }
      if (rank[status] > rank[worst]) worst = status;
    }

    push(worst, null);
  }

  const by = (s: GapStatus) => gaps.filter((g) => g.status === s);

  const respondentMap = new Map<string, { name: string; relationLabel: string; answered: number }>();
  for (const a of familyAnswers) {
    if (!isFamilyExpectationKey(a.questionKey)) continue;
    const existing = respondentMap.get(a.familyMemberId);
    if (existing) existing.answered += 1;
    else
      respondentMap.set(a.familyMemberId, {
        name: a.familyMemberName,
        relationLabel: a.relationLabel,
        answered: 1,
      });
  }

  return {
    gaps,
    needsDiscussion: by("NEEDS_DISCUSSION"),
    different: by("DIFFERENT"),
    aligned: by("ALIGNED"),
    unknown: by("UNKNOWN"),
    respondents: [...respondentMap.values()],
  };
}

/**
 * Same answer or not — the honest limit of what this codebase knows about
 * questions it has never modelled a severity for.
 *
 * Never returns NEEDS_DISCUSSION. "Mostly traditional" against "Balanced" is a
 * difference; whether it is a *problem* depends on the family, and inventing a
 * scale for that would be exactly the manufactured certainty this layer refuses.
 */
function plainCompare(selfAnswer: string, familyValue: string | string[]): GapStatus {
  return selfAnswer === firstValue(familyValue) ? "ALIGNED" : "DIFFERENT";
}

/* ------------------------------------------------------------------ */
/* The block Grio reads                                                */
/* ------------------------------------------------------------------ */

/** Past this it stops being a briefing and becomes a family audit. */
const MAX_PER_BUCKET = 4;

/**
 * Null when the family has answered nothing at all — an "expectation gaps"
 * heading with no expectations in it invents a subject.
 *
 * Aligned items are included but last and trimmed hardest. They matter for one
 * sentence — "ye teen baatein ghar ke saath already set hain" is genuinely
 * reassuring — and for nothing beyond it.
 */
export function formatExpectationGaps(report: ExpectationGapReport): string | null {
  if (report.respondents.length === 0) return null;

  const section = (title: string, rows: ExpectationGap[]) => {
    if (rows.length === 0) return null;
    const lines = rows
      .slice(0, MAX_PER_BUCKET)
      .map((g) => `- ${g.label} (${g.area}): ${g.detail}`)
      .join("\n");
    const more = rows.length > MAX_PER_BUCKET ? `\n  ...aur ${rows.length - MAX_PER_BUCKET} aur.` : "";
    return `${title}\n${lines}${more}`;
  };

  const who = report.respondents
    .map((r) => `${r.name} (${r.relationLabel}, ${r.answered} jawab)`)
    .join(", ");

  const blocks = [
    section("GHAR KE SAATH YE BAAT SAAF KARNI CHAHIYE:", report.needsDiscussion),
    section("YAHAN FARAK HAI, PAR TAKRAAV NAHI:", report.different),
    section("YE GHAR KE SAATH PEHLE SE SET HAI:", report.aligned),
    section("GHAR SE IN PAR KUCH NAHI AAYA:", report.unknown.filter((g) => g.missing !== "self")),
  ].filter(Boolean);

  return `AAP AUR AAPKE GHAR KI SOCH (jinhone jawab diya: ${who}):

${blocks.join("\n\n")}

Is hisse ke sakht niyam:
- Ye tulna CODE ne ki hai. Kaun sahi hai ye faisla na code ne kiya hai na aap kar sakte hain — aap sirf farak dikha rahe hain.
- Farak hona bura nahi hai. "Aapki family galat hai", "ye red flag hai", "inhe manaiye" — aisa kuch kabhi mat kahiye. Bahut ghar aise hi chalte hain.
- Ye baat sirf aapke user se hai. Ghar walon ne jo likha wo unhone apne portal par likha hai; user ka apna jawab unhe kabhi nahi dikhta, aur aap bhi kabhi ye mat kahiye ki "unhe bata dijiye ki aapne kya kaha".
- Jab user poochein ki ghar ke saath koi farak hai kya, to pehle "SAAF KARNI CHAHIYE" wali cheezein bataiye — ek ya do, poori list nahi.
- Jispar ghar se kuch nahi aaya, use farak mat kahiye. Wo sirf ek sawaal hai jo abhi poochha nahi gaya.`;
}
