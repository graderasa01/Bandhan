/**
 * "Grio band karo" — the one thing a member says to Grio that is about the
 * screen rather than a question for the brain. Answered here, before any turn
 * is sent: paying for a model call to hear "bye" would also make closing slow.
 *
 * Strict in the same way the web's spoken-confirmation reader is: the *whole*
 * utterance has to be a closing phrase (after dropping a few words that ride
 * along — "Grio", "please", "abhi"). "Band karo mat", "interest band karo" or
 * "chat band kyun hai?" are questions, and go to Grio like any other.
 */

const RIDE_ALONG = new Set(["grio", "please", "plz", "pls", "abhi", "ab", "ji", "yaar", "dost", "bhai", "isko", "ise", "app", "ok", "okay"]);

const CLOSE_PHRASES = new Set([
  "band",
  "bandh",
  "band karo",
  "band kar do",
  "band kardo",
  "band kar dijiye",
  "band kijiye",
  "band ho jao",
  "bandh karo",
  "bandh kar do",
  "close",
  "close karo",
  "close kar do",
  "close kardo",
  "close it",
  "bye",
  "bye bye",
  "alvida",
  "tata",
  "exit",
  "bas",
  "bas karo",
  "bas ho gaya",
  "chup",
  "chup ho jao",
]);

const MAX_WORDS = 6;

export function isCloseCommand(raw: string): boolean {
  const words = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > MAX_WORDS) return false;
  const core = words.filter((w) => !RIDE_ALONG.has(w)).join(" ");
  return CLOSE_PHRASES.has(core);
}
