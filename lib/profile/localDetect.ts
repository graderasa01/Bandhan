/**
 * Tier-0 detection — cheap, client-side, zero-cost keyword/regex matching
 * against the *interim* (still-being-spoken) transcript.
 *
 * This never fills a field and never gets saved. Its only job is to flip a
 * chip on the question rail from "pending" to "listening" the instant the
 * user's words plausibly touch that field — real confirmation still comes
 * from the one Sonnet call fired when the user stops talking (interviewPrompt.ts).
 * A chip this function lit up can go back to "pending" a moment later if the
 * server disagrees; it must never jump straight to "confirmed" — that badge
 * is earned only by the real extraction, or the interview's core promise
 * ("kuch save nahi hota jab tak confirm na karein") stops being true.
 *
 * Deliberately narrow: only fields where a keyword match is high-precision
 * enough not to mislead. Free-text fields like profession or aboutMe are left
 * out — a false "listening" flash there is worse than no signal at all.
 */

const CITY_WORDS = [
  "Jaipur", "Delhi", "Mumbai", "Pune", "Bengaluru", "Bangalore", "Hyderabad",
  "Chennai", "Kolkata", "Ahmedabad", "Surat", "Lucknow", "Kanpur", "Nagpur",
  "Indore", "Bhopal", "Patna", "Vadodara", "Ludhiana", "Agra", "Nashik",
  "Jodhpur", "Udaipur", "Kota", "Gurgaon", "Gurugram", "Noida", "Chandigarh",
  "Amritsar", "Varanasi", "Ranchi", "Raipur", "Guwahati", "Bhubaneswar",
  "Thane", "Faridabad", "Meerut", "Rajkot", "Sikar", "Bikaner", "Ajmer",
];

const HEIGHT_PATTERN = /\b\d\s*(?:'|foot|feet|ft)\s*\d{0,2}\b/i;
const MARRIAGE_PATTERNS = [
  /kunwar|shaadi nahi|unmarried|abhi shaadi/i,
  /talaak|divorce/i,
  /vidhwa|vidhur|widow/i,
];
const DIET_PATTERNS = [/non.?veg|mans.?ahari|chicken|mutton/i, /shakahari|pure veg|\bveg\b/i];

export type LocalGuess = { fragment: string };

/**
 * Returns a map of field key → the fragment of speech that triggered it.
 * Called on every interim transcript update — keep it cheap (plain regex,
 * no allocation-heavy work) since it runs on every partial speech result.
 */
export function detectLocalGuesses(transcript: string): Partial<Record<string, LocalGuess>> {
  const out: Partial<Record<string, LocalGuess>> = {};
  if (!transcript || transcript.trim().length < 3) return out;

  const city = CITY_WORDS.find((c) => new RegExp(`\\b${c}\\b`, "i").test(transcript));
  if (city) out.currentCity = { fragment: city };

  const heightMatch = transcript.match(HEIGHT_PATTERN);
  if (heightMatch) out.height = { fragment: heightMatch[0] };

  for (const pattern of MARRIAGE_PATTERNS) {
    const m = transcript.match(pattern);
    if (m) {
      out.maritalStatus = { fragment: m[0] };
      break;
    }
  }

  for (const pattern of DIET_PATTERNS) {
    const m = transcript.match(pattern);
    if (m) {
      out.diet = { fragment: m[0] };
      break;
    }
  }

  return out;
}
