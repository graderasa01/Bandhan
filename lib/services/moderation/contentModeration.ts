import "server-only";
import { callAi } from "@/lib/ai/providers";

/**
 * Screening for anything one user sends to another *before* they have matched
 * — voice-note transcripts today, Ask-Bridge questions next.
 *
 * ## Two passes, and why
 *
 * **Pass 1 is deterministic** and handles the things a regex is simply better
 * at than a model: phone numbers, emails, links, "mera whatsapp le lo". These
 * are not judgement calls, they are the platform's core safety rule (M08:
 * first contact happens inside the platform) and they must not depend on an
 * API being up, an account having credit, or a model being in a good mood.
 *
 * **Pass 2 is the model**, for what a regex cannot read: coercion, dowry talk,
 * sexual content phrased politely, caste-baiting. Cheap tier (Haiku) because
 * pass 1 has already removed the easy cases.
 *
 * ## Fail-closed
 *
 * If pass 2 can't run — no key, no credit, provider down — the verdict is
 * `PENDING`, not `APPROVED`. A pending note is simply not delivered and shows
 * up in the admin queue. The alternative (deliver on failure) would mean the
 * safety of the platform degrades exactly when infrastructure does, which is
 * the worst possible time for it.
 */

export type ModerationDecision = "APPROVED" | "REJECTED" | "PENDING";

export interface ModerationResult {
  decision: ModerationDecision;
  /** User-facing when REJECTED, internal when PENDING. Null when clean. */
  reason: string | null;
}

/**
 * Contact-detail patterns. Deliberately broad — a false positive costs the
 * user one re-record, a false negative moves a stranger's phone number onto
 * the platform's conscience.
 */
const CONTACT_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    // Indian mobile, with or without +91, spaces/dashes/dots between digits.
    pattern: /(?:\+?91[\s-]?)?[6-9](?:[\s.-]?\d){9}/,
    reason: "Mobile number bheja gaya hai. Number sirf dono taraf se haan ke baad share hota hai.",
  },
  {
    pattern: /[\w.+-]+@[\w-]+\.[\w.]{2,}/,
    reason: "Email address bheja gaya hai. Contact detail platform ke bahar share nahi kar sakte.",
  },
  {
    pattern: /(?:https?:\/\/|www\.)\S+|\b\S+\.(?:com|in|net|org|io|me)\b/i,
    reason: "Link bheja gaya hai. Bahar ka link bhejna allowed nahi hai.",
  },
  {
    pattern: /\b(?:wh?ats?\s?app?|watsap+|vatsap+|wtsp|telegram|insta(?:gram)?|snap(?:chat)?|facebook|fb|gmail)\b/i,
    reason: "Doosre app par le jaane ki baat hai. Pehli baat BandhanTak ke andar hi hoti hai.",
  },
  {
    // An email or a handle said out loud rather than typed.
    pattern: /\bat\s*the\s*rate\b|\bdot\s*(?:com|in)\b/i,
    reason: "Email ya ID bataayi gayi hai. Contact detail platform ke bahar share nahi kar sakte.",
  },
  {
    // Asking for, or offering, a number without saying the digits.
    pattern:
      /\b(?:mera|meri|apna|apni|aapka|aapki|tumhara|tumhari|your|my)\s+(?:mobile\s+|phone\s+|contact\s+|whats\s?app\s+|insta\s+)?(?:number|no|num)\b|\b(?:number|contact|id)\s+(?:do|dijiye|dijie|dena|de\s*do|bhejo|bhejiye|send|share)\b/i,
    reason: "Number ya ID ki baat hai. Number sirf dono taraf se haan ke baad share hota hai.",
  },
];

/**
 * The same rules for speech that Sarvam writes back in Devanagari.
 *
 * Substring rather than regex-with-`\b`: JavaScript's word boundary only knows
 * ASCII word characters, so `\bनंबर\b` never matches anything. Every entry is
 * specific enough that a substring hit is already the thing being looked for.
 */
const DEVANAGARI_CONTACT_WORDS: { words: string[]; reason: string }[] = [
  {
    words: ["व्हाट्सएप", "व्हाट्सऐप", "वॉट्सऐप", "वाट्सएप", "इंस्टा", "टेलीग्राम", "फेसबुक", "स्नैपचैट", "जीमेल"],
    reason: "Doosre app par le jaane ki baat hai. Pehli baat BandhanTak ke andar hi hoti hai.",
  },
  {
    words: ["मेरा नंबर", "मेरा नम्बर", "अपना नंबर", "अपना नम्बर", "आपका नंबर", "नंबर दो", "नंबर दीजिए", "नंबर भेजो", "नंबर दे दो", "एट द रेट", "डॉट कॉम"],
    reason: "Number ya ID ki baat hai. Number sirf dono taraf se haan ke baad share hota hai.",
  },
];

/**
 * Digits spoken as words — "nau aath saat…", "nine eight double seven…",
 * "नौ आठ सात…". The digit regex above only sees numerals, and a speech
 * recogniser writes a dictated number as words at least as often as it writes
 * digits, so this is the gap a dictated phone number walks straight through.
 *
 * Each token is scored by how many digits it stands for; a run of
 * `SPOKEN_DIGIT_RUN` or more is a number being read out. Eight rather than ten
 * because recognisers drop the odd word, and no ordinary sentence names eight
 * digits in a row — "do" and "ek" are common Hindi words, eight of them in a
 * row are not.
 */
const SPOKEN_DIGIT_RUN = 8;

const DIGIT_WORDS = new Set([
  // English
  "zero", "oh", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  // Hinglish (Latin)
  "shunya", "shoonya", "sunya", "ek", "do", "teen", "tin", "char", "chaar", "paanch", "panch", "paach",
  "chhe", "che", "chah", "chhah", "chheh", "saat", "sat", "aath", "aat", "ath", "nau", "nao", "no",
  // Devanagari
  "शून्य", "जीरो", "ज़ीरो", "एक", "दो", "तीन", "चार", "पांच", "पाँच", "छह", "छः", "छे", "सात", "आठ", "नौ",
  "वन", "टू", "थ्री", "फोर", "फाइव", "सिक्स", "सेवन", "एट", "नाइन",
]);
/** Words that multiply the next digit ("double nine" = two digits). Scored as one extra. */
const REPEAT_WORDS = new Set(["double", "triple", "dabal", "डबल", "ट्रिपल"]);

function longestSpokenDigitRun(text: string): number {
  let best = 0;
  let run = 0;
  for (const token of text.toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (!token) continue;
    if (/^\d+$/.test(token)) run += token.length;
    else if (DIGIT_WORDS.has(token)) run += 1;
    else if (REPEAT_WORDS.has(token)) run += 1;
    else run = 0;
    if (run > best) best = run;
  }
  return best;
}

/** Devanagari numerals → ASCII, so the digit patterns above see them. */
function asciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/**
 * Dowry and money demands. Listed here rather than left to the model because
 * these are illegal in India (Dowry Prohibition Act) and a "borderline" call
 * is not one we want an LLM making on our behalf.
 */
const DEMAND_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\b(?:dahej|dowry|tilak|jodi\s?maal|lena\s?dena)\b/i,
    reason: "Dahej se judi baat allowed nahi hai.",
  },
];

export interface DeterministicVerdict {
  blocked: boolean;
  reason: string | null;
}

/** Pass 1. Exported so the Ask-Bridge can reuse it on typed questions. */
export function screenDeterministic(text: string): DeterministicVerdict {
  const normalised = asciiDigits(text.normalize("NFKC"));
  for (const { pattern, reason } of [...CONTACT_PATTERNS, ...DEMAND_PATTERNS]) {
    if (pattern.test(normalised)) return { blocked: true, reason };
  }
  for (const { words, reason } of DEVANAGARI_CONTACT_WORDS) {
    if (words.some((w) => normalised.includes(w))) return { blocked: true, reason };
  }
  if (longestSpokenDigitRun(normalised) >= SPOKEN_DIGIT_RUN) {
    return { blocked: true, reason: "Number bola gaya hai. Number sirf dono taraf se haan ke baad share hota hai." };
  }
  return { blocked: false, reason: null };
}

const MODERATION_SYSTEM = `Aap BandhanTak (Indian matrimony platform) ke content moderator hain. Aapko ek user ka message mila hai jo ek AJNABI candidate ko bheja ja raha hai — dono abhi match nahi hue hain.

Message ko reject kijiye agar usme koi bhi ho:
- Sexual ya body ke baare me comment
- Gaali, dhamki, ya insult
- Caste, religion ya region par taunt
- Paise, dahej, ya gift ki demand
- Kisi bhi tarah ka dabaav ya emotional blackmail
- Contact detail (number, email, social handle) ya platform ke bahar milne ki baat

Warna approve kijiye. Normal matrimony sawaal — kaam, ghar, family, khaana, shauk, future plans — bilkul theek hain, unhe reject mat kijiye.

Sirf JSON dijiye.`;

const MODERATION_SCHEMA = {
  type: "object",
  properties: {
    safe: { type: "boolean" },
    reason: {
      type: "string",
      description: "Agar safe false hai to ek chhoti Hinglish line — user ko yahi dikhegi. Warna khaali string.",
    },
  },
  required: ["safe", "reason"],
  additionalProperties: false,
} as const;

/**
 * Full screening. `userId` is for cost attribution on the AiInteraction row.
 *
 * Empty/absent text returns PENDING rather than APPROVED: a voice note whose
 * transcript never arrived (mic worked, speech recognition didn't) has not
 * been checked by anything, and "we couldn't read it" is not "it's fine".
 */
export async function moderateOutgoingText(params: {
  text: string | null;
  userId: string;
  logFeature: string;
}): Promise<ModerationResult> {
  const text = params.text?.trim() ?? "";

  if (!text) {
    return {
      decision: "PENDING",
      reason: "Transcript nahi mila — bina padhe deliver nahi kar sakte, admin review me hai.",
    };
  }

  const pass1 = screenDeterministic(text);
  if (pass1.blocked) return { decision: "REJECTED", reason: pass1.reason };

  const result = await callAi({
    configFeature: "contentModeration",
    logFeature: params.logFeature,
    userId: params.userId,
    system: MODERATION_SYSTEM,
    content: text,
    maxTokens: 200,
    // A verdict plus a short reason. Reasoning here would exceed the budget
    // and fail closed on every clip — see `AiCallParams.thinking`.
    thinking: "off",
    jsonSchema: MODERATION_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "moderation_verdict",
  });

  if (!result.ok) {
    console.error(`[moderation] AI pass unavailable (${result.kind}) — holding for review.`);
    return { decision: "PENDING", reason: `AI screening unavailable: ${result.kind}` };
  }

  try {
    const parsed = JSON.parse(result.text) as { safe?: unknown; reason?: unknown };
    if (parsed.safe === true) return { decision: "APPROVED", reason: null };
    const reason = typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "Ye message bheja nahi ja sakta.";
    return { decision: "REJECTED", reason };
  } catch {
    // A malformed verdict is not a pass — same fail-closed rule as above.
    console.error("[moderation] unparseable verdict, holding for review.");
    return { decision: "PENDING", reason: "Screening ka jawab samajh nahi aaya." };
  }
}
