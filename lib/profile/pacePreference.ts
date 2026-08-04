/**
 * A two-way choice ("ek-ek karke" vs "ek saath") doesn't need a model call —
 * cheap keyword matching is enough, and free. Defaults to "together" (3)
 * whenever the answer doesn't clearly ask for one-at-a-time, matching the
 * app's own default pace.
 */
const ONE_AT_A_TIME_KEYWORDS = [
  "ek ek",
  "ek-ek",
  "ek by ek",
  "ek baar me ek",
  "alag alag",
  "alag-alag",
  "one at a time",
  "one by one",
  "dheere dheere",
  "aaram se",
  "slow",
];

export function detectPacePreference(text: string): 1 | 3 {
  const t = text.toLowerCase();
  return ONE_AT_A_TIME_KEYWORDS.some((kw) => t.includes(kw)) ? 1 : 3;
}
