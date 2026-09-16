/**
 * The question `/bolo` holds up — the one thing on screen Grio is waiting to
 * hear right now — and the answers that can simply be tapped for it.
 *
 * ## Why the page picks the question, not the transcript
 *
 * The conversation belongs to the model (agent.ts): Grio chooses the words.
 * The screen still needs one question to show, and it cannot wait for a
 * transcript — someone without a microphone never produces one. So the
 * question is derived in code, from the draft:
 *
 *   - the next unanswered field, in `BOLO_ASK_ORDER` below — which is also the
 *     ladder Grio's brief reads out, one field per turn, because the brief is
 *     generated from this array (`describeAskLadder`). Two orders would be two
 *     conversations, and a voice asking three things while the screen holds up
 *     one is how a person ends up answering the same question twice. Gender is
 *     last because a name or a "bete ke liye" has usually answered it by then;
 *   - unless Grio has just asked, out loud, about a different unanswered field
 *     (`detectAskedField`) — then that one, so the chips under the question are
 *     for the thing she is actually listening for.
 *
 * ## The two preferences are questions nine and ten
 *
 * Once the eight are in, the ladder does not stop at the review: it asks the
 * partner's age range and city — the exact pair `preferenceEvidence.ts` needs
 * (`MIN_COMPARABLE_SIGNALS`) before the reel may show a preference match at
 * all. They used to be asked only out loud, and only after the OTP, which left
 * everyone who tapped their way through — and everyone whose mic never opened
 * — landing on a reel that had to say "general suggestions". Asking them here,
 * right after the eighth answer, is the same two questions in the one place the
 * person is already answering questions.
 *
 * They are optional in the way the eight are not: every preference ask carries
 * a skip chip, and a skipped key is passed back in `skipped` so the ladder
 * moves on and nothing asks again.
 *
 * ## Chips never invent a vocabulary
 *
 * A chip stores a value the rest of the app already accepts: on a select field
 * it is one of that field's catalog options, on a text field it is the same
 * spelling the tap deck stores (`quickPicks.ts`). `scripts/bolo-questions-
 * check.ts` asserts it, the way `quick-picks-check.ts` does for the deck. A
 * `null` chip ("+ Doosra shehar") stores nothing — it hands the answer to the
 * keyboard, and a `skip` chip hands nothing to nobody.
 *
 * Pure and isomorphic, so the check script runs every rule here without a
 * browser.
 */

import type { FillingFor } from "@/lib/contracts/interview";
import { FIELD_BY_KEY } from "@/lib/profile/fields";
import { isValidFieldValue } from "@/lib/profile/readiness";
import {
  BOLO_PREFERENCE_KEYS,
  isBoloPreferenceKey,
  missingMinimum,
  missingPreferences,
  normalizeAnswer,
  type BoloValues,
} from "./draft";

/** The one question that is not a catalog field: who the profile is for. */
export const FILLING_FOR_ASK = "fillingFor";

/** The one order both the screen and Grio's brief follow (agent.ts, "Kram" step 2), one field at a time. Gender last — see the header. */
export const BOLO_ASK_ORDER: readonly string[] = [
  FILLING_FOR_ASK,
  "fullName",
  "dateOfBirth",
  "height",
  "currentCity",
  "maritalStatus",
  "education",
  "profession",
  "gender",
];

/**
 * The two optional preferences, in the order they are asked — after the eight,
 * age before city, because an age range is the one nearly everybody has an
 * answer to.
 */
export const BOLO_PREFERENCE_ASK_ORDER: readonly string[] = [...BOLO_PREFERENCE_KEYS];

/** Whether an ask is one of the two optional preferences rather than a field the profile needs to go live. */
export function isPreferenceAsk(key: string): boolean {
  return isBoloPreferenceKey(key);
}

/**
 * Everything the conversation still has to ask, in the order it asks it. A
 * minimum field this list does not know yet (a catalog change) is still
 * asked — after the known ones, in the catalog's own words.
 *
 * The two preferences come last, and only once nothing a live profile needs is
 * outstanding — they are the step after the eight, never a question that
 * delays one. `skipped` is what the person has already waved away this
 * sitting; those never come back.
 */
export function pendingAskKeys(
  fillingFor: FillingFor | null,
  values: BoloValues,
  skipped: readonly string[] = [],
): string[] {
  const missing = missingMinimum(values);
  const pending: string[] = fillingFor ? [] : [FILLING_FOR_ASK];
  for (const key of BOLO_ASK_ORDER) if (missing.includes(key)) pending.push(key);
  for (const key of missing) if (!pending.includes(key)) pending.push(key);
  if (pending.length > 0) return pending;
  return missingPreferences(values).filter((key) => !skipped.includes(key));
}

/**
 * The gender a "who is this for" answer already gives. The typed interview
 * applies the same rule (`setFillingFor` in profileState.tsx): right after
 * "bete ke liye", "beta hai ya beti?" is a question the person just answered.
 */
export function impliedGender(fillingFor: FillingFor | null | undefined): "Ladka" | "Ladki" | null {
  return fillingFor === "son" ? "Ladka" : fillingFor === "daughter" ? "Ladki" : null;
}

/* ------------------------------------------------------------------ */
/* Questions and chips                                                 */
/* ------------------------------------------------------------------ */

export interface BoloChip {
  /** Dictionary key for the label — only where the label is not already English. */
  labelKey?: string;
  label: string;
  /** What a tap stores. `null` stores nothing and puts the keyboard on the question instead. */
  value: string | null;
  /** For a `null` chip: what the composer's placeholder says while it waits. */
  placeholderKey?: string;
  placeholder?: string;
  /** "Abhi nahi" — the question is let go of, nothing is stored, nothing is asked again. Only on an optional ask. */
  skip?: true;
}

export interface BoloAsk {
  key: string;
  /** Dictionary key; `question` is the Hinglish source. */
  questionKey: string;
  question: string;
  /** An example for an answer nobody can tap ("Jaise: 12/05/1995"). */
  hintKey?: string;
  hint?: string;
  /** At most six, and none at all where a tap would only be a guess. A skip chip is not one of the six. */
  chips: BoloChip[];
  /** One of the two preferences: skippable, and asked after the profile is already complete. */
  optional?: true;
}

const COPY: Record<string, { self: string; child: string; hint?: string }> = {
  [FILLING_FOR_ASK]: { self: "Profile kiske liye bana rahe hain?", child: "Profile kiske liye bana rahe hain?" },
  fullName: { self: "Aapka poora naam kya hai?", child: "Unka poora naam kya hai?", hint: "Jaise: Rahul Sharma" },
  dateOfBirth: { self: "Aapki date of birth kya hai?", child: "Unki date of birth kya hai?", hint: "Jaise: 12/05/1995" },
  height: { self: "Aapki height kitni hai?", child: "Unki height kitni hai?" },
  currentCity: { self: "Aap kis shehar mein rehte hain?", child: "Wo kis shehar mein rehte hain?" },
  maritalStatus: { self: "Aapka marital status kya hai?", child: "Unka marital status kya hai?" },
  education: { self: "Aapki highest education kya hai?", child: "Unki highest education kya hai?" },
  profession: { self: "Aap kya kaam karte hain?", child: "Wo kya kaam karte hain?" },
  gender: { self: "Aap ladka hain ya ladki?", child: "Beta hai ya beti?" },
  // The two preferences: about the partner, so "aapka" only ever means whose
  // search it is — the child's profile still looks for *their* partner.
  partnerAgeRange: { self: "Partner ki umar kitni ho?", child: "Unke partner ki umar kitni ho?" },
  partnerCityPreference: { self: "Partner kis sheher se ho?", child: "Unka partner kis sheher se ho?" },
};

/** "Abhi nahi" — on an optional ask only. Stores nothing and the ladder moves on. */
const SKIP: BoloChip = { labelKey: "bolo.chip.skip", label: "Abhi nahi", value: null, skip: true };

const SOMETHING_ELSE: BoloChip = {
  labelKey: "bolo.chip.other",
  label: "+ Kuch aur",
  value: null,
  placeholderKey: "bolo.composer.otherPlaceholder",
  placeholder: "Apna jawab likhein…",
};

/** The heights given most often, by gender — four taps; anything else goes through the keyboard. */
const COMMON_HEIGHTS: Record<"Ladka" | "Ladki" | "unknown", string[]> = {
  Ladka: [`5'6"`, `5'8"`, `5'10"`, `6'0"`],
  Ladki: [`5'0"`, `5'2"`, `5'4"`, `5'6"`],
  unknown: [`5'2"`, `5'5"`, `5'8"`, `5'10"`],
};

function plain(...values: string[]): BoloChip[] {
  return values.map((value) => ({ label: value, value }));
}

function chipsFor(key: string, values: BoloValues): BoloChip[] {
  switch (key) {
    case FILLING_FOR_ASK:
      return [
        { labelKey: "bolo.who.self", label: "Apne liye", value: "self" },
        { labelKey: "bolo.who.son", label: "Bete ke liye", value: "son" },
        { labelKey: "bolo.who.daughter", label: "Beti ke liye", value: "daughter" },
      ];
    case "gender":
      return [
        { labelKey: "bolo.chip.gender.Ladka", label: "Ladka", value: "Ladka" },
        { labelKey: "bolo.chip.gender.Ladki", label: "Ladki", value: "Ladki" },
      ];
    case "height": {
      const gender = values.gender === "Ladka" || values.gender === "Ladki" ? values.gender : "unknown";
      return [
        ...plain(...COMMON_HEIGHTS[gender]),
        {
          labelKey: "bolo.chip.otherHeight",
          label: "+ Doosri height",
          value: null,
          placeholderKey: "bolo.composer.heightPlaceholder",
          placeholder: `Jaise: 5.7 ya 5'7"`,
        },
      ];
    }
    case "currentCity":
      return [
        ...plain("Jaipur", "Delhi", "Mumbai", "Pune"),
        {
          labelKey: "bolo.chip.otherCity",
          label: "+ Doosra shehar",
          value: null,
          placeholderKey: "bolo.composer.cityPlaceholder",
          placeholder: "Shehar ka naam likhein…",
        },
      ];
    case "maritalStatus":
      return plain("Never Married", "Divorced", "Widowed");
    case "education":
      return [...plain("Graduate", "B.Tech", "MBA", "Post Graduate"), SOMETHING_ELSE];
    case "profession":
      return [...plain("Software Engineer", "Business", "Government Job", "Doctor"), SOMETHING_ELSE];
    case "partnerAgeRange":
      // Straight off the catalog: every range it offers is one tap, so nobody
      // has to spell a dash the keyboard makes hard.
      return [...plain(...(FIELD_BY_KEY.partnerAgeRange?.options ?? [])), SKIP];
    case "partnerCityPreference":
      // "Isi sheher me" is the answer most families give, and it is a real
      // constraint; "Kahin bhi" is deliberately not a chip — it states no
      // preference, which is what the skip already says in one tap.
      return [
        ...plain("Isi sheher me", "Jaipur", "Delhi NCR", "Mumbai"),
        {
          labelKey: "bolo.chip.otherCity",
          label: "+ Doosra shehar",
          value: null,
          placeholderKey: "bolo.composer.cityPlaceholder",
          placeholder: "Shehar ka naam likhein…",
        },
        SKIP,
      ];
    default:
      // A name and a date of birth are nobody's to suggest.
      return [];
  }
}

export function askFor(key: string, fillingFor: FillingFor | null, values: BoloValues): BoloAsk {
  const forChild = fillingFor === "son" || fillingFor === "daughter";
  const copy = COPY[key];
  const field = FIELD_BY_KEY[key];
  const catalogQuestion = field ? (forChild ? field.questionForChild : field.question) : key;
  return {
    key,
    questionKey: `bolo.ask.${key}.${forChild ? "child" : "self"}`,
    question: copy ? (forChild ? copy.child : copy.self) : catalogQuestion,
    hintKey: copy?.hint ? `bolo.ask.${key}.hint` : undefined,
    hint: copy?.hint,
    chips: chipsFor(key, values),
    ...(isPreferenceAsk(key) ? { optional: true as const } : {}),
  };
}

/** The chip that stores `value` for `key`, if one does — so "Ladka" reads the same in the bubble as on its chip. */
export function chipFor(key: string, value: string, values: BoloValues = {}): BoloChip | null {
  return chipsFor(key, values).find((chip) => chip.value === value) ?? null;
}

/* ------------------------------------------------------------------ */
/* Following Grio's voice                                              */
/* ------------------------------------------------------------------ */

/**
 * The words Grio uses when she asks for a field, Hinglish and English. Wide on
 * purpose: a miss only means the screen keeps its own next question, and a
 * match only ever counts for a field that is still unanswered — so "Badhai ho,
 * profile live hai" can never pull the screen back to a question.
 */
const ASKED: ReadonlyArray<readonly [string, RegExp]> = [
  [FILLING_FOR_ASK, /kis ?ke liye|for whom|who is (?:this|the profile) for/i],
  ["fullName", /\bnaam\b|\bname\b/i],
  ["dateOfBirth", /date of birth|birth ?date|\bdob\b|janm|janam/i],
  ["height", /\bheight\b|lambai|\bkad\b|how tall/i],
  ["currentCity", /sheh[ae]r|\bcity\b|kaha+n rehte|where do you live/i],
  ["maritalStatus", /marital|shaadi (?:hui|ho chuki)|pehle shaadi|\bmarried\b|divorc|widow/i],
  ["education", /education|padh?ai|padhaai|\bdegree\b|qualification/i],
  ["profession", /profession|occupation|kya kaam|kaam kya|\bjob\b|naukri|kya karte/i],
  ["gender", /\bgender\b|ladk[ae] hain ya ladki|beta hai ya beti|\bmale\b|\bfemale\b/i],
  // The two preferences only ever become pending once the eight are in, so
  // these may use the same plain words the city and the date of birth use.
  ["partnerAgeRange", /\bumar\b|\bage\b|kitne saal|how old/i],
  ["partnerCityPreference", /sheh[ae]r|\bcity\b|kaha+n se|where from/i],
];

/**
 * Which still-unanswered field Grio is asking about in `said` — the one she
 * names first, since a batched question leads with the field it wants first.
 * Null when she names none of them.
 */
export function detectAskedField(said: string, pending: readonly string[]): string | null {
  if (!said.trim() || pending.length === 0) return null;
  let found: string | null = null;
  let at = Number.POSITIVE_INFINITY;
  for (const [key, pattern] of ASKED) {
    if (!pending.includes(key)) continue;
    const match = pattern.exec(said);
    if (match && match.index < at) {
      found = key;
      at = match.index;
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* A typed answer to the question on screen                            */
/* ------------------------------------------------------------------ */

/** "apne liye", "mere bete ke liye", "for my daughter" → who; null when the text is not that. */
export function readFillingFor(text: string): FillingFor | null {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  if (/\bbeti\b|daughter|बेटी/u.test(s)) return "daughter";
  if (/\bbet[ae]\b|\bson\b|बेटा|बेटे/u.test(s)) return "son";
  if (/\bapn[ae]\b|\bkhud\b|\bmere liye\b|\bmyself\b|\bself\b|\bfor me\b|अपने|खुद/u.test(s)) return "self";
  return null;
}

const LETTERS = "A-Za-z\\u00C0-\\u024F\\u0900-\\u097F";

/**
 * What a bare answer to a free-text question looks like. A sentence ("main
 * Jaipur me rehta hoon") is not one — it goes to the extractor, which reads
 * meaning; these only take answers that need no reading at all.
 */
const BARE_TEXT: Record<string, { shape: RegExp; maxWords: number; filler: RegExp }> = {
  fullName: {
    shape: new RegExp(`^[${LETTERS}][${LETTERS}.' -]*$`),
    maxWords: 4,
    filler: /\b(?:mera|meri|naam|name|my|is|hai|hoon|hun|main|i am)\b/i,
  },
  currentCity: {
    shape: new RegExp(`^[${LETTERS}][${LETTERS}.() -]*$`),
    maxWords: 3,
    filler: /\b(?:me|mein|main|mai|rehta|rehti|rehte|hoon|hun|hai|hain|i|live|in|city|sheh[ae]r)\b/i,
  },
  profession: {
    shape: new RegExp(`^[${LETTERS}][${LETTERS}0-9.&/()' -]*$`),
    maxWords: 5,
    filler: /\b(?:main|mai|hoon|hun|hai|hain|mera|meri|karta|karti|karte|i|am|work|at)\b/i,
  },
};

/**
 * A typed answer to `key`, when it can be taken as it is: normalised exactly
 * the way a spoken one is (`normalizeAnswer`) and valid by the field's own
 * rule. Null means "not sure" — the caller hands the text to the extractor.
 */
export function readTypedValue(key: string, text: string): string | null {
  const field = FIELD_BY_KEY[key];
  const raw = text.trim().replace(/[.!।]+$/u, "").trim();
  if (!field || !raw || raw.length > 60 || raw.includes("\n")) return null;
  // A list is several answers; only a date — and a multiselect, where a list is
  // exactly what the field holds ("Jaipur, Delhi NCR") — carries one inside.
  if (key !== "dateOfBirth" && field.type !== "multiselect" && /[,;]/.test(raw)) return null;
  if (field.type === "text") {
    const rule = BARE_TEXT[key];
    if (!rule) return null;
    if (raw.split(/\s+/).length > rule.maxWords || !rule.shape.test(raw) || rule.filler.test(raw)) return null;
  }
  const value = normalizeAnswer(key, raw);
  return isValidFieldValue(field, value) ? value : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12/05/1995" (or the server's "1995-05-12") → "12 May 1995", the way people say it back. */
export function displayDate(value: string): string {
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parts = dmy ? [dmy[1], dmy[2], dmy[3]] : iso ? [iso[3], iso[2], iso[1]] : null;
  const month = parts ? MONTHS[Number(parts[1]) - 1] : undefined;
  return parts && month ? `${Number(parts[0])} ${month} ${parts[2]}` : value;
}
