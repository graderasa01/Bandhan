import raw from "~/catalog/grio.generated.json";

/**
 * The Marriage Intelligence questions a `<<<LEARN:key=option>>>` card asks —
 * the web catalog's own wording and options (lib/profile/intelligenceQuestions.ts,
 * snapshotted by `scripts/sync-catalog.ts`). The card confirms a real answer
 * to a real question; the server (`saveSignalAnswer`) still rejects any key or
 * option outside the catalog.
 */

export interface LearnQuestion {
  key: string;
  label: string;
  question: string;
  options: string[];
  multi: boolean;
  visibility: "PROFILE_VISIBLE" | "MATCH_PRIVATE" | "PRIVATE";
}

const QUESTIONS = raw.learnQuestions as LearnQuestion[];
const BY_KEY: Record<string, LearnQuestion> = Object.fromEntries(QUESTIONS.map((q) => [q.key, q]));
const DEAL_BREAKER_LABEL = raw.dealBreakerLabel as Record<string, string>;

/** The Ask Bridge ceiling — `QUESTION_MAX_LENGTH` in lib/contracts/askBridge.ts. */
export const ASK_QUESTION_MAX_LENGTH: number = raw.askQuestionMaxLength;

/**
 * The question a LEARN card may ask, or null when there is none to ask: an
 * unknown key (nothing to show), or a multi-select — saving one option would
 * replace the whole stored set, a card that deletes data if you agree with it.
 * The web card refuses the same two.
 */
export function learnQuestion(key: string): LearnQuestion | null {
  const q = BY_KEY[key];
  return q && !q.multi ? q : null;
}

/** Trimmed, case- and dash-insensitive — the en-dash in "6–12 months" is the real miss. */
function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/[–—-]/g, "-").replace(/\s+/g, " ");
}

/** The catalog option the model meant, or null — then the card shows every option instead. */
export function matchLearnOption(question: LearnQuestion, proposed: string): string | null {
  const want = normalise(proposed);
  return question.options.find((o) => normalise(o) === want) ?? null;
}

/** Display only; the stored value stays the option itself. */
export function learnOptionLabel(option: string): string {
  return DEAL_BREAKER_LABEL[option] ?? option;
}
