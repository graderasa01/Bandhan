/**
 * Yes / no / skip, heard in Hinglish — the only "understanding" the spoken
 * stop card is allowed to do on its own.
 *
 * Pure, deterministic keyword tables; no model. Every step this serves is a
 * closed question ("batayein ya skip karein?", "umar 25–29, sheher Jaipur —
 * sahi?", "chalein?") and a wrong guess either asks two more questions,
 * saves a preference the person did not confirm, or leaves the page — so the
 * rule is conservative: a phrase that carries both a yes-word and a
 * no/skip-word ("haan, skip kar do", "sahi nahi hai") resolves to the
 * *refusal*, and anything unrecognised is `unclear`, never a coin toss.
 *
 * Word-boundary matching on a normalised transcript, so "hanji" matches on
 * its own but "chandigarh" never matches "han". Devanagari spellings ride
 * along because browser STT returns them for Hindi locales.
 */

export type VoiceIntent = "yes" | "no" | "unclear";

/** The review step has a third answer: not "wrong", just "leave it". */
export type ReviewIntent = VoiceIntent | "skip";

const YES_WORDS = [
  "haan", "han", "ha", "hanji", "haanji", "ji", "jee", "theek", "thik", "ok", "okay", "yes", "yeah", "yep", "sure",
  "bilkul", "zaroor", "karo", "kar do", "kar", "sahi", "achha", "accha", "acha", "correct", "right", "perfect", "done",
  "chalo", "chalein", "chale", "chalen", "aage", "next", "badho", "badhein", "badhiye", "continue", "go",
  "dikhao", "dikhaiye", "dekho", "dekhte", "dekhein", "kholo", "open", "shuru",
  "batao", "bataun", "batata", "batati", "batate", "batayein", "bataiye", "batana", "batati hoon", "batata hoon",
  "हाँ", "हां", "हा", "जी", "ठीक", "सही", "चलो", "चलें", "आगे", "बताओ", "बताती", "बताता", "दिखाओ",
];

const NO_WORDS = [
  "nahi", "nahin", "nai", "na", "mat", "ruko", "rukiye", "wait", "abhi nahi", "baad me", "baad mein", "thoda",
  "ek minute", "rehne do", "rehne", "chhodo", "chhod", "nope", "no", "cancel", "band", "skip",
  "galat", "wrong", "badlo", "badal", "change",
  "नहीं", "ना", "मत", "रुको", "बाद", "गलत", "स्किप",
];

/**
 * "Say that again" — not an answer at all. In the offer and the confirm step
 * this is `unclear`, which re-asks the question once; over a read-back value
 * it is a `no`, because "dobara" there means "let me say it again".
 */
const REPEAT_WORDS = ["dobara", "phir se", "firse", "repeat", "kya bola", "samjha nahi", "samajh nahi", "sunai nahi", "दोबारा", "फिर से"];

/** Words that decline the *offer* specifically — they mean "move on", which in the offer step is a skip. */
const SKIP_WORDS = [
  "skip", "chhodo", "chhod", "rehne do", "rehne", "baad me", "baad mein", "seedha", "seedhe", "direct", "jaane do",
  "aage", "next", "chalo", "chalein", "chale", "chalen", "badho", "badhein", "badhiye", "continue",
  "nahi", "nahin", "nai", "na",
  "स्किप", "छोड़ो", "आगे", "चलो", "चलें", "नहीं",
];

/**
 * In the review step "leave it" is narrower: "aage badho" over a read-back
 * value is an acceptance ("yes, and move on"), so the move-on words are
 * *not* here — only the ones that mean "drop this".
 */
const REVIEW_SKIP_WORDS = [
  "skip", "chhodo", "chhod", "rehne do", "rehne", "baad me", "baad mein", "jaane do",
  "स्किप", "छोड़ो", "बाद",
];

function normalise(transcript: string): string {
  return ` ${transcript
    .toLowerCase()
    .replace(/[.,!?।\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function hasAny(text: string, words: readonly string[]): boolean {
  return words.some((w) => text.includes(` ${w} `));
}

/**
 * "Chalein?" — leave, or stay. A refusal anywhere in the phrase wins, so
 * "haan par abhi nahi" stays put.
 */
export function classifyConfirm(transcript: string): VoiceIntent {
  const text = normalise(transcript);
  if (!text.trim()) return "unclear";
  if (hasAny(text, REPEAT_WORDS)) return "unclear";
  if (hasAny(text, NO_WORDS)) return "no";
  if (hasAny(text, YES_WORDS)) return "yes";
  return "unclear";
}

/**
 * "2 pasand batayein, ya skip?" — `yes` means tell, `no` means skip. The
 * move-on words ("aage", "next", "chalo") are a skip here even though they are
 * a yes to "chalein?": in this step they answer the question the person was
 * actually asked, which was whether to add two more things first.
 */
export function classifyOffer(transcript: string): VoiceIntent {
  const text = normalise(transcript);
  if (!text.trim()) return "unclear";
  if (hasAny(text, REPEAT_WORDS)) return "unclear";
  if (hasAny(text, SKIP_WORDS) || hasAny(text, NO_WORDS)) return "no";
  if (hasAny(text, YES_WORDS)) return "yes";
  return "unclear";
}

/**
 * "Umar 25–29, sheher Jaipur — sahi?" — the one answer that may *save*
 * something. `yes` confirms exactly the values read back; `no` ("nahi",
 * "galat", "dobara") drops them and asks again; `skip` leaves the step with
 * nothing saved. "Sahi nahi hai" is a no, "haan skip kar do" is a skip, and
 * "aage badho" is a yes — the person heard the values and moved on.
 */
export function classifyReview(transcript: string): ReviewIntent {
  const text = normalise(transcript);
  if (!text.trim()) return "unclear";
  if (hasAny(text, REVIEW_SKIP_WORDS)) return "skip";
  if (hasAny(text, NO_WORDS) || hasAny(text, REPEAT_WORDS)) return "no";
  if (hasAny(text, YES_WORDS)) return "yes";
  return "unclear";
}
