/**
 * Mindset / vibe questions — a short, separate flow shown once, right after
 * Stage 1 goes live (see MindsetFlow.tsx). These are deliberately NOT in
 * PROFILE_FIELDS: they are tap-only choices, never sent through voice
 * extraction, so this entire feature costs zero AI calls (D-31 cost
 * discipline) and never touches the interview's gap engine or extraction
 * schema (D-32 — code decides what's asked, and here code is all there is).
 *
 * Values persist through the same draft → save-draft → ProfileLifestyle path
 * as everything else (see fieldMapping.ts), just with keys that live outside
 * the interview catalog.
 */

export type MindsetKey = "weekendVibe" | "bigDecisionStyle" | "socialEnergy";

export type MindsetOption = {
  value: string;
  /** Short chip label — same "instantly recognisable on its own" rule as fields.ts. */
  label: string;
  /** The vibe-line fragment this choice contributes when answered. */
  vibeFragment: string;
};

export type MindsetQuestionDef = {
  key: MindsetKey;
  question: string;
  whyNeeded: string;
  options: MindsetOption[];
};

export const MINDSET_QUESTIONS: MindsetQuestionDef[] = [
  {
    key: "weekendVibe",
    question: "Weekend free ho to sabse pehle kya karoge?",
    whyNeeded:
      "Isse hum aapki profile pe ek chhota 'vibe' insight dikhayenge — jaise aap kaisi soch rakhte hain, sirf degree ya job se nahi.",
    options: [
      { value: "Ghoomna", label: "Pahad ya nayi jagah ghoomna", vibeFragment: "Ghumakkad" },
      { value: "Ghar par relax", label: "Ghar par family/dost ke saath relax", vibeFragment: "Ghar-priya" },
      { value: "Kuch naya seekhna", label: "Kuch naya seekhna ya karna", vibeFragment: "Seekhne ke shaukeen" },
      { value: "Jo mann kare", label: "Jo mann kare, spontaneously", vibeFragment: "Spontaneous" },
    ],
  },
  {
    key: "bigDecisionStyle",
    question: "Koi bada faisla lena ho to aap kaise lete hain?",
    whyNeeded: "Matrimony me ye baat matter karti hai — family ki raay leke chalte hain ya khud decide karte hain.",
    options: [
      { value: "Khud soch samajh kar", label: "Khud soch samajh kar", vibeFragment: "Independent soch" },
      { value: "Family se poochh kar", label: "Family/close logo se poochh kar", vibeFragment: "Family-oriented" },
      { value: "Dil ki sunkar", label: "Dil ki sunkar turant", vibeFragment: "Dil se faisla lene wale" },
      { value: "Pros-cons dekh kar", label: "Pros-cons list bana kar", vibeFragment: "Analytical" },
    ],
  },
  {
    key: "socialEnergy",
    question: "Naye logo ke beech aap kaisa mehsoos karte hain?",
    whyNeeded: "Ye batata hai aap logo ke saath kaise ghulte-milte hain — kisi ko bhiid pasand hai, kisi ko chhota circle.",
    options: [
      { value: "Jaldi ghul-mil jaata hoon", label: "Bahar se energy milti hai, jaldi ghul-mil jaata hoon", vibeFragment: "Milansaar" },
      { value: "Time lagta hai", label: "Thoda time lagta hai khulne me", vibeFragment: "Thoda reserved" },
      { value: "Chhota group pasand", label: "Chhoti group me comfortable, bhiid me nahi", vibeFragment: "Close-knit logo ko prefer karne wale" },
      { value: "Mood par depend", label: "Depend karta hai mood par", vibeFragment: "Mood ke hisaab se" },
    ],
  },
];

export const MINDSET_KEYS: MindsetKey[] = MINDSET_QUESTIONS.map((q) => q.key);

/** True once every mindset question has an answer (or the user skipped the whole flow). */
export function isMindsetAnswered(values: Record<string, string>): boolean {
  return MINDSET_KEYS.every((k) => Boolean(values[k]?.trim()));
}

export function mindsetAnsweredCount(values: Record<string, string>): number {
  return MINDSET_KEYS.filter((k) => Boolean(values[k]?.trim())).length;
}

/**
 * Deterministic — no AI call. Joins whichever fragments are answered into one
 * short Hinglish line. Returns null when nothing has been answered yet, so
 * callers can fall back to "abhi pata nahi" messaging instead of an empty line.
 */
export function buildVibeLine(values: Record<string, string>): string | null {
  const fragments = MINDSET_QUESTIONS.flatMap((q) => {
    const answer = values[q.key];
    if (!answer) return [];
    const option = q.options.find((o) => o.value === answer);
    return option ? [option.vibeFragment] : [];
  });

  if (fragments.length === 0) return null;
  if (fragments.length === 1) return fragments[0];
  if (fragments.length === 2) return `${fragments[0]} aur ${fragments[1]}`;
  return `${fragments.slice(0, -1).join(", ")} aur ${fragments[fragments.length - 1]}`;
}
