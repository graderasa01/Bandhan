/** Parses the exact reply text seen in the app, to tell a parser bug from a stale bundle. */
import { parseGrioSegments } from "../lib/contracts/grio";

const REPLY = "<<<DO:sendInterestToProfile>>> Theek hai dost, Ananya Kapoor ko interest bhej raha hoon.";

console.log("INPUT:", JSON.stringify(REPLY));
console.log("\nSEGMENTS:");
for (const s of parseGrioSegments(REPLY)) {
  if (s.type === "run") console.log(`  [run]    key=${s.key} arg=${s.arg}`);
  else if (s.type === "action") console.log(`  [action] key=${s.key} arg=${s.arg}`);
  else if (s.type === "who") console.log(`  [who]    n=${s.n}`);
  else if (s.type === "find") console.log(`  [find]   ${JSON.stringify(s.filters)} skipped=${JSON.stringify(s.skipped)}`);
  else console.log(`  [${s.type}]   ${JSON.stringify(s.value)}`);
}
