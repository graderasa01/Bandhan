/**
 * Checks the two pure pieces of the voice work — run with `npx tsx`.
 *
 *  - `spokenSummary`: what a reply sounds like versus what it looks like.
 *  - the confirmation reader: the guard standing between a misheard name and a
 *    sent interest, so its refusals matter more than its acceptances.
 *
 * `readConfirmation` lives inside GrioChatCore (a client component that pulls in
 * React and the whole overlay), so the table below is kept in step with it by
 * hand rather than imported. It is duplicated only here, only for the check.
 */
import { spokenSummary } from "../components/grio/useGrioVoice";

const CONFIRM_YES = new Set([
  "haan", "han", "haa", "ha", "hn", "ji", "yes", "yeah", "yep", "ok", "okay", "theek", "thik",
  "sahi", "bilkul", "zaroor", "jaroor", "jarur", "sure", "done", "chalo",
]);
const CONFIRM_NO = new Set([
  "na", "naa", "nahi", "nahin", "nai", "no", "nope", "mat", "cancel", "rehne", "rahne", "chhodo",
  "chodo", "ruko", "rukiye", "ruk",
]);
const CONFIRM_FILLER = new Set([
  "bhej", "bhejo", "do", "dijiye", "dena", "de", "kar", "karo", "kardo", "please", "dost", "bhai",
  "hai", "he", "isko", "unko", "ise", "use",
]);
const CONFIRM_MAX_WORDS = 4;

function readConfirmation(raw: string): "yes" | "no" | "unclear" {
  const words = raw.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > CONFIRM_MAX_WORDS) return "unclear";
  if (words.some((w) => CONFIRM_NO.has(w))) return "no";
  if (!words.some((w) => CONFIRM_YES.has(w))) return "unclear";
  return words.every((w) => CONFIRM_YES.has(w) || CONFIRM_FILLER.has(w)) ? "yes" : "unclear";
}

let failed = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n      want=${want}  got=${got}`);
}

console.log("── readConfirmation ──");
check('"haan"', readConfirmation("haan"), "yes");
check('"haan bhej do"', readConfirmation("haan bhej do"), "yes");
check('"ji bilkul"', readConfirmation("ji bilkul"), "yes");
check('"ok"', readConfirmation("ok"), "yes");
check('"nahi"', readConfirmation("nahi"), "no");
check('"na rehne do"', readConfirmation("na rehne do"), "no");
check('"haan nahi ruko"  (negation wins)', readConfirmation("haan nahi ruko"), "no");
check('"mat bhejo"', readConfirmation("mat bhejo"), "no");
// The ones that must NOT be read as agreement.
check('"haan par pehle batao"', readConfirmation("haan par pehle batao"), "unclear");
check('"theek hai par kitna quota bacha"', readConfirmation("theek hai par kitna quota bacha"), "unclear");
check('"Priya kaun hai"', readConfirmation("Priya kaun hai"), "unclear");
check('""', readConfirmation(""), "unclear");

console.log("\n── spokenSummary ──");
const short = "Aaj ke 5 me se 3 rishtey baaki hain. Kis par nazar daalein?";
check("short reply is spoken whole", spokenSummary(short), short);

const marker = "<<<WHO:2>>>\n<<<DO:sendInterestToProfile>>>\nTheek hai, Priya ko interest bhej raha hoon.";
check(
  "markers never reach the synthesiser",
  spokenSummary(marker),
  "Theek hai, Priya ko interest bhej raha hoon.",
);

const long =
  "Interest bhejne ka matlab hai ki aap saamne wale ko bata rahe hain ki aapko unki profile pasand aayi hai. " +
  "Is mahine aapke quota me se ek slot kharch hoga aur abhi aapke paas chh slot bache hain. " +
  "Bhejne ke baad chaubees ghante tak aap ise wapas le sakte hain, lekin quota ka slot wapas nahi milta. " +
  "Agar unhone pehle se aapko interest bheja hua hai to bhejte hi match ban jayega aur chat turant khul jayegi. " +
  "Iske alawa unki kuchh chhupi hui jaankari bhi khul jayegi.";
const spoken = spokenSummary(long);
console.log(`      full=${long.length} chars → spoken=${spoken.length} chars`);
console.log(`      → ${spoken}`);
check("long reply is cut", spoken.length < long.length, true);
check("cut reply says where the rest is", spoken.endsWith("Baaki screen par likha hai."), true);
check("cut happens on a sentence boundary", spoken.includes("pasand aayi hai."), true);

console.log(`\n${failed === 0 ? "all passed" : `${failed} failed`}`);
process.exit(failed === 0 ? 0 : 1);
