import type { GrioAnswerStyle, GrioIntent } from "@/lib/contracts/grioProfile";

/**
 * What a question about a profile is asking for — decided by code, before any
 * model is involved.
 *
 * ## Why not let the model work it out
 *
 * Every Grio turn used to go through one prompt carrying *everything*: the
 * roster, today's board, the pending inbox, the whole self-knowledge graph, the
 * dossier, the action catalog. "Family?" paid for all of it, and the model then
 * had to find the four family fields somewhere in twelve thousand tokens. The
 * intent is what lets each question load only what it needs (see
 * `promptBuilder.ts`), skip the model entirely when code can answer (kundli,
 * what is missing, which features apply), and send the right buttons.
 *
 * Deterministic on purpose: the same words always route the same way, the
 * check script can pin every example the product was asked to support, and a
 * misroute is a one-line fix in a table rather than a prompt tweak.
 *
 * Hinglish first, English and Devanagari too — a member types however they
 * talk, and "परिवार कैसा है" is the same question as "family kaisi hai".
 */

export interface DetectedIntent {
  intent: GrioIntent;
  /** 0..1 — how clearly the words pointed here. Low values fall back to a general answer. */
  confidence: number;
  /** The keywords that decided it, for the debug trace. */
  matched: string[];
  style: GrioAnswerStyle;
  /** True when the question was a bare continuation ("aur batao") of the previous intent. */
  followUp: boolean;
}

/** Devanagari words members actually use, mapped onto the Latin rules below. */
const DEVANAGARI: [RegExp, string][] = [
  [/परिवार|फैमिली|घरवाले/g, " family "],
  [/कुंडली|कुण्डली|गुण मिलान|मांगलिक/g, " kundli "],
  [/शौक|लाइफस्टाइल|जीवनशैली/g, " lifestyle "],
  [/मैसेज|संदेश|बात कैसे/g, " message "],
  [/कॉमन|समान|दोनों/g, " common "],
  [/अंतर|फर्क|अलग/g, " farak "],
  [/क्या कमी|अधूरी|गायब/g, " missing "],
  [/मेरे लिए|मेरे लायक/g, " mere liye "],
  [/खास|ख़ास|विशेष/g, " khaas "],
  [/सारांश|संक्षेप/g, " summary "],
  [/पसंद|अपेक्षा/g, " pasand "],
];

function normalise(text: string): string {
  let t = ` ${text.toLowerCase()} `;
  for (const [re, latin] of DEVANAGARI) t = t.replace(re, latin);
  return t
    .replace(/[“”"'’‘`]/g, "")
    .replace(/[?!.,;:()[\]{}|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Rule {
  intent: GrioIntent;
  weight: number;
  patterns: [RegExp, string][];
}

const w = (re: RegExp, label?: string): [RegExp, string] => [re, label ?? re.source.replace(/\\b/g, "")];

/**
 * Specific intents weigh 3 per hit, broad ones 1–2, so "Iske lifestyle ke
 * baare mein batao" lands on lifestyle rather than on the summary its
 * "baare mein batao" also reads as.
 */
const RULES: Rule[] = [
  {
    intent: "KUNDALI_REQUEST",
    weight: 4,
    patterns: [
      w(/\bkund(a)?li\b/, "kundli"),
      w(/\bkundali\b/, "kundali"),
      w(/\bguna?s?\b/, "guna"),
      w(/\bgun ?milan\b/, "gun milan"),
      w(/\bmilan\b/, "milan"),
      w(/\bmanglik\b/, "manglik"),
      w(/\bhoroscope\b/, "horoscope"),
      w(/\bjyotish\b/, "jyotish"),
      w(/\brashi\b/, "rashi"),
      w(/\bnakshatra\b/, "nakshatra"),
      w(/\bastro\w*/, "astro"),
    ],
  },
  {
    intent: "MESSAGE_HELP",
    weight: 3,
    patterns: [
      w(/\bmessage\w*/, "message"),
      w(/\bmsg\b/, "msg"),
      w(/\bbaat (kaise|shuru|start)\b/, "baat kaise"),
      w(/\b(start|shuru) (kaise|karun|karu|karoon)\b/, "start kaise"),
      w(/\bopening( line)?\b/, "opening"),
      w(/\b(pehla|first) (message|msg|sawaal|line)\b/, "first message"),
      w(/\bkya (likh|bol)(un|u|oon|na)\b/, "kya likhun"),
      w(/\bice ?breaker\b/, "icebreaker"),
      w(/\bconversation\b/, "conversation"),
      w(/\bhow (do i|to|should i) (start|talk|message|approach)\b/, "how to start"),
      w(/\bapproach\b/, "approach"),
    ],
  },
  {
    intent: "INTEREST_HELP",
    weight: 3,
    patterns: [
      w(/\binterest (bhej|send|de|dena|du|doon)\w*/, "interest bhejna"),
      w(/\bsend (an )?interest\b/, "send interest"),
      w(/\bshortlist\w*/, "shortlist"),
      w(/\blike (kar|karu|karun|karo)\w*/, "like karna"),
      w(/\bsave (kar|karo|karu|karun)\w*/, "save karna"),
    ],
  },
  {
    intent: "PROFILE_MISSING_INFO",
    weight: 3,
    patterns: [
      w(/\bmissing\b/, "missing"),
      w(/\bkya nahi (pata|diya|bataya|likha|bhara)\b/, "kya nahi diya"),
      w(/\badhoor(i|a)\b/, "adhoori"),
      w(/\bincomplete\b/, "incomplete"),
      w(/\bkhaa?li\b/, "khaali"),
      w(/\bnahi bata(ya|yi)\b/, "nahi bataya"),
      w(/\bgaps?\b/, "gaps"),
      w(/\bkami\b/, "kami"),
      w(/\bwhat (is|s) not (there|mentioned|given)\b/, "not mentioned"),
    ],
  },
  {
    intent: "PROFILE_DIFFERENCE",
    weight: 3,
    patterns: [
      w(/\bdifferen\w*/, "difference"),
      w(/\bfar(a)?k\b/, "farak"),
      w(/\balag\b/, "alag"),
      w(/\bmismatch\w*/, "mismatch"),
      w(/\bnahi milt(a|i|e)\b/, "nahi milta"),
      w(/\bconcerns?\b/, "concern"),
      w(/\bred flags?\b/, "red flag"),
      w(/\bclash\w*/, "clash"),
      w(/\bdiffer\b/, "differ"),
    ],
  },
  {
    intent: "PROFILE_COMPARE",
    weight: 3,
    patterns: [
      w(/\bcommon\b/, "common"),
      w(/\bsame\b/, "same"),
      w(/\bhum dono\b/, "hum dono"),
      w(/\bdono (me|mein|ka|ki|ke)\b/, "dono me"),
      w(/\bsimilar\w*/, "similar"),
      w(/\bmilt(a|i|e) (hai|hain|julta|julti)\b/, "milta hai"),
      w(/\bmel\b/, "mel"),
      w(/\boverlap\w*/, "overlap"),
      w(/\bcompare\w*/, "compare"),
      w(/\btulna\b/, "tulna"),
      w(/\bin common\b/, "in common"),
      w(/\bboth of us\b/, "both of us"),
    ],
  },
  {
    intent: "PROFILE_FAMILY",
    weight: 3,
    patterns: [
      w(/\bfamily\b/, "family"),
      w(/\bpariv(a)?a?r\b/, "parivar"),
      w(/\bghar ?wal\w*/, "gharwale"),
      w(/\b(maa|mata|mummy|papa|pita|parents?|father|mother)\b/, "parents"),
      w(/\b(bhai|behen|behan|siblings?)\b/, "siblings"),
      w(/\b(joint|nuclear)\b/, "joint/nuclear"),
      w(/\bsanskar\b/, "sanskar"),
    ],
  },
  {
    intent: "PROFILE_LIFESTYLE",
    weight: 3,
    patterns: [
      w(/\blife ?style\b/, "lifestyle"),
      w(/\bshau(q|k)\w*/, "shauk"),
      w(/\bhobb(y|ies)\b/, "hobbies"),
      w(/\binterests\b/, "interests"),
      w(/\bdiet\b/, "diet"),
      w(/\b(khana|khaan ?paan|veg|non ?veg|vegetarian)\b/, "khaan-paan"),
      w(/\bsmok\w*/, "smoking"),
      w(/\b(drink\w*|sharab|daaru)\b/, "drinking"),
      w(/\bweekend\b/, "weekend"),
      w(/\b(travel|music|fitness|gym|routine|pets?)\b/, "activities"),
      w(/\bjeevan shaili\b/, "jeevan shaili"),
    ],
  },
  {
    intent: "PROFILE_PREFERENCES",
    weight: 3,
    patterns: [
      w(/\b(unki|inki|iski|uski|their|his|her) (pasand|expectations?|preferences?|apeksha)\b/, "unki pasand"),
      w(/\bpartner (preference|expectation)\w*/, "partner preference"),
      w(/\bkaisa (partner|jeevansaathi|ladka|ladki|rishta) (chahiye|chahte|chahti)\b/, "kaisa partner"),
      w(/\bkya chah(te|ti)\b/, "kya chahte"),
      w(/\blooking for\b/, "looking for"),
      w(/\bexpectations?\b/, "expectations"),
      w(/\bapeksha\b/, "apeksha"),
    ],
  },
  {
    intent: "PROFILE_COMPATIBILITY",
    weight: 3,
    patterns: [
      w(/\bcompatib\w*/, "compatibility"),
      w(/\bscore\b/, "score"),
      w(/\bkitna match\b/, "kitna match"),
      w(/\bpercent\w*|%/, "percentage"),
      w(/\bsoch\b/, "soch"),
      w(/\branking\b/, "ranking"),
      w(/\bkyun (dikha|dikhi|upar|aaya|aayi)\b/, "kyun dikha"),
      w(/\bwhy (this|is this|am i seeing)\b/, "why this"),
    ],
  },
  {
    intent: "PROFILE_FOR_ME",
    weight: 3,
    patterns: [
      w(/\bmere liye\b/, "mere liye"),
      w(/\bfor me\b/, "for me"),
      w(/\bmere layak\b/, "mere layak"),
      w(/\bspecial\b/, "special"),
      w(/\bkhaa?s\b/, "khaas"),
      w(/\bworth\b/, "worth"),
      w(/\bmujhe (kyun|kya)\b/, "mujhe kya"),
      w(/\bmere hisaab\b/, "mere hisaab"),
      w(/\bsahi (hai|rahega|hoga)\b/, "sahi hai"),
      // "What should I know?" is the member asking what matters and what to
      // watch — the for-me answer's two halves. Only with "message" beside it
      // does it become message prep (MESSAGE_HELP wins the tie on priority).
      w(/\bjaan(na|ne) (chahiye|zaroori)\b/, "kya jaanna chahiye"),
      w(/\bwhat should i know\b/, "what should i know"),
      w(/\bdhyaa?n (dena|rakhna|dein|de)\b/, "dhyan dena"),
    ],
  },
  {
    intent: "SERVICE_DISCOVERY",
    weight: 2,
    patterns: [
      w(/\bfeatures?\b/, "features"),
      w(/\bservices?\b/, "services"),
      w(/\bkya (kya )?kar sakt\w*/, "kya kar sakta"),
      w(/\bkya (aur )?dekh sakt\w*/, "kya dekh sakta"),
      w(/\baur kya\b/, "aur kya"),
      w(/\boptions?\b/, "options"),
      w(/\bbandhantak\b/, "bandhantak"),
      w(/\buseful\b/, "useful"),
    ],
  },
  {
    intent: "NAVIGATION",
    weight: 2,
    patterns: [
      w(/\b(profile|page) (kholo|khol do|open|dikhao)\b/, "profile kholo"),
      w(/\bopen (the |this )?profile\b/, "open profile"),
      w(/\bpoori profile\b/, "poori profile"),
      w(/\bfull profile\b/, "full profile"),
    ],
  },
  {
    intent: "PROFILE_SUMMARY",
    weight: 1,
    patterns: [
      w(/\bsummar\w*/, "summary"),
      w(/\bsaar\b/, "saar"),
      w(/\boverview\b/, "overview"),
      w(/\bbaa?re me(in)?\b/, "baare me"),
      w(/\babout (this|the|her|him)\b/, "about"),
      w(/\btell me\b/, "tell me"),
      w(/\bkaun hai\b/, "kaun hai"),
      w(/\bdetail\w*/, "detail"),
      w(/\bpoints?\b/, "points"),
      w(/\bbatao\b|\bbataiye\b|\bbata do\b/, "batao"),
      w(/\bintroduc\w*/, "introduce"),
    ],
  },
];

/** Tiebreak when two intents score the same: the more specific question wins. */
const PRIORITY: GrioIntent[] = [
  "KUNDALI_REQUEST",
  "MESSAGE_HELP",
  "INTEREST_HELP",
  "PROFILE_MISSING_INFO",
  "PROFILE_DIFFERENCE",
  "PROFILE_COMPARE",
  "PROFILE_FAMILY",
  "PROFILE_LIFESTYLE",
  "PROFILE_PREFERENCES",
  "PROFILE_COMPATIBILITY",
  "PROFILE_FOR_ME",
  "SERVICE_DISCOVERY",
  "NAVIGATION",
  "PROFILE_SUMMARY",
  "GENERAL_QUESTION",
];

const NUMBER_WORDS: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, chaar: 4, char: 4, four: 4, paanch: 5, panch: 5, five: 5,
};

export function detectStyle(text: string): GrioAnswerStyle {
  const t = normalise(text);
  const m = /\b(\d+|ek|one|do|two|teen|three|chaar|char|four|paanch|panch|five)\s+(important\s+|main\s+|zaroori\s+|key\s+)?(points?|baatein|baaten|cheezein|cheezen|lines?|bullets?|things)\b/.exec(t);
  const n = m ? (Number.isFinite(Number(m[1])) ? Number(m[1]) : (NUMBER_WORDS[m[1]] ?? null)) : null;
  return {
    maxPoints: n !== null && n > 0 && n <= 10 ? n : null,
    simple: /\b(simple|aasan|asaan|easy|seedh(i|e)|short|chhota|chota|brief|kam shabdon)\b/.test(t),
    detailed: /\b(detail\w*|vistaar|poora|puri|full|elaborate)\b/.test(t),
  };
}

const CONTINUATION = /^(aur|more|aur batao|aur bataiye|aur kuch|detail me|detail mein|details|tell me more|continue|phir|then|aage)$/;

/** Intents that are about the open profile — the ones the profile path answers. */
export const PROFILE_PATH_INTENTS: ReadonlySet<GrioIntent> = new Set<GrioIntent>([
  "PROFILE_SUMMARY",
  "PROFILE_FOR_ME",
  "PROFILE_FAMILY",
  "PROFILE_LIFESTYLE",
  "PROFILE_PREFERENCES",
  "PROFILE_COMPARE",
  "PROFILE_DIFFERENCE",
  "PROFILE_MISSING_INFO",
  "PROFILE_COMPATIBILITY",
  "KUNDALI_REQUEST",
  "MESSAGE_HELP",
  "SERVICE_DISCOVERY",
  "NAVIGATION",
]);

export function detectGrioIntent(text: string, opts: { previousIntent?: GrioIntent | null } = {}): DetectedIntent {
  const t = normalise(text);
  const style = detectStyle(text);

  if (CONTINUATION.test(t) && opts.previousIntent && PROFILE_PATH_INTENTS.has(opts.previousIntent)) {
    return {
      intent: opts.previousIntent,
      confidence: 0.6,
      matched: ["(follow-up)"],
      style: { ...style, detailed: true },
      followUp: true,
    };
  }

  const scores = new Map<GrioIntent, { score: number; matched: string[] }>();
  for (const rule of RULES) {
    for (const [re, label] of rule.patterns) {
      if (re.test(t)) {
        const cur = scores.get(rule.intent) ?? { score: 0, matched: [] };
        cur.score += rule.weight;
        cur.matched.push(label);
        scores.set(rule.intent, cur);
      }
    }
  }

  // "3 important points batao" is a summary with a shape, not a question about
  // what is important *for me* — the count is the tell.
  if (style.maxPoints !== null && !scores.has("PROFILE_FOR_ME")) {
    const cur = scores.get("PROFILE_SUMMARY") ?? { score: 0, matched: [] };
    scores.set("PROFILE_SUMMARY", { score: cur.score + 3, matched: [...cur.matched, "n points"] });
  }
  // "simple language me summary" — the style words alone also read as a summary request.
  if ((style.simple || style.detailed) && scores.size === 0) {
    scores.set("PROFILE_SUMMARY", { score: 1, matched: ["style only"] });
  }

  if (scores.size === 0) {
    return { intent: "GENERAL_QUESTION", confidence: 0, matched: [], style, followUp: false };
  }

  const ranked = [...scores.entries()].sort((a, b) => {
    if (b[1].score !== a[1].score) return b[1].score - a[1].score;
    return PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]);
  });
  const [topIntent, top] = ranked[0];
  const second = ranked[1]?.[1].score ?? 0;
  const confidence = Math.round((top.score / (top.score + second + 1)) * 100) / 100;

  return { intent: topIntent, confidence, matched: top.matched, style, followUp: false };
}
