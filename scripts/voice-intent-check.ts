import assert from "node:assert/strict";
import { classifyConfirm, classifyOffer, classifyReview } from "../lib/speech/voiceIntent";

/**
 * The three closed questions the spoken stop card asks, and what each
 * common Hinglish answer must mean in each of them.
 *
 * Run: `npx tsx scripts/voice-intent-check.ts`
 *
 * No database, no model — the classifiers are keyword tables, and this pins
 * the table so a phrase added for one step cannot quietly flip another:
 * "aage badho" is a *skip* when offered two more questions, a *yes* over a
 * read-back value, and a *yes* to "chalein?". A refusal anywhere in a phrase
 * wins, and anything unrecognised is `unclear` — never a guess that saves a
 * preference or leaves the page.
 */

type Row = {
  said: string;
  /** "Rishte dekhein — chalein?" */
  confirm: ReturnType<typeof classifyConfirm>;
  /** "2 pasand batayein, ya skip karein?" */
  offer: ReturnType<typeof classifyOffer>;
  /** "Umar 25–29, sheher Jaipur — sahi?" */
  review: ReturnType<typeof classifyReview>;
};

const ROWS: Row[] = [
  // The plain yeses.
  { said: "haan", confirm: "yes", offer: "yes", review: "yes" },
  { said: "Haan ji", confirm: "yes", offer: "yes", review: "yes" },
  { said: "theek hai", confirm: "yes", offer: "yes", review: "yes" },
  { said: "thik hai", confirm: "yes", offer: "yes", review: "yes" },
  { said: "sahi hai", confirm: "yes", offer: "yes", review: "yes" },
  { said: "bilkul sahi", confirm: "yes", offer: "yes", review: "yes" },
  { said: "हाँ, ठीक है", confirm: "yes", offer: "yes", review: "yes" },
  { said: "yes correct", confirm: "yes", offer: "yes", review: "yes" },
  { said: "batati hoon", confirm: "yes", offer: "yes", review: "yes" },
  // Move-on words: yes to leaving, yes over a read-back, but a *skip* of the offer.
  { said: "next chalo", confirm: "yes", offer: "no", review: "yes" },
  { said: "aage badho", confirm: "yes", offer: "no", review: "yes" },
  { said: "chalo", confirm: "yes", offer: "no", review: "yes" },
  { said: "continue", confirm: "yes", offer: "no", review: "yes" },
  // The plain noes.
  { said: "nahi", confirm: "no", offer: "no", review: "no" },
  { said: "nahin", confirm: "no", offer: "no", review: "no" },
  { said: "नहीं", confirm: "no", offer: "no", review: "no" },
  { said: "galat hai", confirm: "no", offer: "no", review: "no" },
  { said: "dobara boliye", confirm: "unclear", offer: "unclear", review: "no" },
  { said: "abhi nahi", confirm: "no", offer: "no", review: "no" },
  { said: "ruko", confirm: "no", offer: "no", review: "no" },
  // Skips: decline the offer; over a read-back they mean "drop it", not "wrong".
  { said: "skip", confirm: "no", offer: "no", review: "skip" },
  { said: "skip kar do", confirm: "no", offer: "no", review: "skip" },
  { said: "baad me", confirm: "no", offer: "no", review: "skip" },
  { said: "rehne do", confirm: "no", offer: "no", review: "skip" },
  { said: "chhodo", confirm: "no", offer: "no", review: "skip" },
  // "Say again" re-asks the question; over a read-back it means "let me redo it".
  { said: "phir se boliye", confirm: "unclear", offer: "unclear", review: "no" },
  { said: "kya bola aapne", confirm: "unclear", offer: "unclear", review: "no" },
  // A refusal anywhere wins over a yes anywhere.
  { said: "haan par abhi nahi", confirm: "no", offer: "no", review: "no" },
  { said: "sahi nahi hai", confirm: "no", offer: "no", review: "no" },
  { said: "haan skip kar do", confirm: "no", offer: "no", review: "skip" },
  { said: "theek hai, dobara", confirm: "unclear", offer: "unclear", review: "no" },
  // Unclear speech never resolves to anything.
  { said: "", confirm: "unclear", offer: "unclear", review: "unclear" },
  { said: "   ", confirm: "unclear", offer: "unclear", review: "unclear" },
  { said: "hmm", confirm: "unclear", offer: "unclear", review: "unclear" },
  { said: "mera naam Rahul hai", confirm: "unclear", offer: "unclear", review: "unclear" },
  { said: "chandigarh", confirm: "unclear", offer: "unclear", review: "unclear" },
  { said: "pachees se untees", confirm: "unclear", offer: "unclear", review: "unclear" },
];

let failures = 0;
for (const row of ROWS) {
  const got = { confirm: classifyConfirm(row.said), offer: classifyOffer(row.said), review: classifyReview(row.said) };
  for (const step of ["confirm", "offer", "review"] as const) {
    try {
      assert.equal(got[step], row[step]);
    } catch {
      failures++;
      console.error(`  FAIL ${step.padEnd(7)} "${row.said}" → ${got[step]} (expected ${row[step]})`);
    }
  }
}

// Word boundaries: a city that *contains* a yes-word is not a yes.
assert.equal(classifyConfirm("chandigarh"), "unclear");
assert.equal(classifyConfirm("kolkata"), "unclear");
// Punctuation and case do not matter.
assert.equal(classifyConfirm("Haan!"), "yes");
assert.equal(classifyReview("Sahi Hai."), "yes");
assert.equal(classifyOffer("Skip."), "no");

if (failures > 0) {
  console.error(`\nvoice-intent-check: ${failures} failure(s)`);
  process.exit(1);
}
console.log(`voice-intent-check: ${ROWS.length} phrases × 3 steps ✓`);
