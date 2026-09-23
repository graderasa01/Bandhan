/**
 * The contact-leak screen and the new Grio markers, without a DB or a model.
 *
 *   npx tsx scripts/voice-leak-check.ts
 *
 * Pins the 2026-09-23 changes: a phone number *said* (words, Devanagari,
 * "double"), a handle spelled out, and a request for a number are all caught by
 * the deterministic pass — while ordinary matrimony sentences, including ones
 * full of "do" and "ek", are not. Plus the `<<<SHOW:>>>` / `<<<FIND:>>>` parser.
 */
import "./_env";
import { screenDeterministic } from "../lib/services/moderation/contentModeration";
import { parseGrioSegments } from "../lib/contracts/grio";

let failures = 0;
function check(label: string, ok: boolean) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

const BLOCKED = [
  "mera number hai 9876543210",
  "nau aath saat chhe paanch chaar teen do ek shunya",
  "nine eight seven six five four three two one zero",
  "nine eight double seven six five four three",
  "मेरा नंबर नौ आठ सात छह पांच चार तीन दो एक शून्य है",
  "९८७६५४३२१०",
  "mujhe whatsapp par message karo",
  "watsapp pe baat karte hain",
  "insta pe follow karo",
  "इंस्टा पर मिलो",
  "priya at the rate gmail dot com",
  "apna number do na",
  "number bhejo please",
  "dahej ki baat pehle kar lete hain",
];

const ALLOWED = [
  "Namaste, aapki profile achhi lagi. Aap kaam ke saath ghar ka dhyan kaise rakhti hain?",
  "Mujhe cooking aur travel pasand hai, aapko kya pasand hai?",
  "Do saal se Pune me hoon, ek chhoti si family hai, teen bhai behen hain",
  "Shaadi ke baad aap job continue karna chahengi?",
  "Aapki ID verified hai, achha laga",
  "मुझे आपकी प्रोफाइल अच्छी लगी, आप क्या काम करते हैं?",
  "interest bhej do aur shortlist bhi kar do",
];

for (const text of BLOCKED) check(`blocks: ${text}`, screenDeterministic(text).blocked);
for (const text of ALLOWED) check(`allows: ${text}`, !screenDeterministic(text).blocked);

// ── markers ──────────────────────────────────────────────────────────────
const show = parseGrioSegments("<<<SHOW:5, 2,2,9>>>\nYe rahe aapke matches.");
const showSeg = show.find((s) => s.type === "show");
check("SHOW parses, dedupes and sorts", showSeg?.type === "show" && showSeg.ns.join(",") === "2,5,9");
check("SHOW leaves the text", show.some((s) => s.type === "text" && s.value.includes("Ye rahe")));

const tooMany = parseGrioSegments("<<<SHOW:1,2,3,4,5,6,7,8>>>");
const tooManySeg = tooMany.find((s) => s.type === "show");
check("SHOW caps at 6", tooManySeg?.type === "show" && tooManySeg.ns.length === 6);

const junk = parseGrioSegments("<<<SHOW:Neha, Isha>>>ok");
check("SHOW with names renders nothing", !junk.some((s) => s.type === "show"));

const find = parseGrioSegments("<<<FIND:Jaipur,   doctor, 26-30 saal>>>\nDekhta hoon.");
const findSeg = find.find((s) => s.type === "find");
check("FIND parses and squashes spaces", findSeg?.type === "find" && findSeg.query === "Jaipur, doctor, 26-30 saal");

const sendWho = parseGrioSegments("<<<WHO:3>>>\n<<<SEND>>>Kal shaam 7 baje call karte hain?<<<END>>>\nTaiyaar hai.");
check(
  "WHO + SEND both survive",
  sendWho.some((s) => s.type === "who" && s.n === 3) &&
    sendWho.some((s) => s.type === "send" && s.value.startsWith("Kal shaam")),
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
