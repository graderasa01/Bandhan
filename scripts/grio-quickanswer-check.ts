/**
 * Checks `matchGrioQuickAnswer`'s guards — run with `npx tsx`.
 *
 * The matcher is pure, so this needs no DB, no key and no model. The cases that
 * matter are the refusals: a miss just costs an ordinary AI call, but a false
 * match answers a question nobody asked, confidently and in code's voice.
 */
import { matchGrioQuickAnswer } from "../lib/services/grio/quickAnswer";
import type { GrioRoster } from "../lib/services/grio/roster";
import type { PendingBriefing } from "../lib/services/grio/pending";

const roster: GrioRoster = {
  reelTotal: 5,
  reelLeft: 3,
  entries: [
    { n: 1, profileId: "p1", name: "Anjali", sources: ["reel"], reelRank: 1, seenToday: false, score: 82 },
    { n: 2, profileId: "p2", name: "Priya", sources: ["reel"], reelRank: 2, seenToday: false, score: 78 },
    { n: 3, profileId: "p3", name: "Meera", sources: ["reel"], reelRank: 3, seenToday: false, score: 71 },
    { n: 4, profileId: "p4", name: "Kavya", sources: ["shortlist"], reelRank: null, seenToday: false, score: null },
  ],
};

const pending: PendingBriefing = {
  lines: ["2 sawaal aapke jawab ka intezaar kar rahe hain.", "3 logon ne aapko interest bheja hai."],
  promptBlock: "(unused here)",
};

/** `null` means "must fall through to the model". */
const CASES: { q: string; expect: string | null; scoped?: boolean }[] = [
  // ── should answer instantly ─────────────────────────────────────────────
  { q: "aaj kitne rishtey hain?", expect: "reel_count" },
  { q: "kaun kaun hai aaj", expect: "reel_count" },
  { q: "kya pending hai", expect: "pending" },
  { q: "kya baaki hai mera", expect: "pending" },
  { q: "sabse upar kaun hai", expect: "top_match" },
  { q: "sabse zyada matching kiska hai", expect: "top_match" },
  { q: "aaj kya hai", expect: "today" },
  { q: "kuch naya?", expect: "today" },

  // ── must NOT answer: a person is named, so they want that person ────────
  { q: "Priya ke baare me batao", expect: null },
  { q: "aaj ke rishtey me se priya kaisi hai", expect: null },
  { q: "sabse upar kaun hai, anjali?", expect: null },

  // ── must NOT answer: it is a request, not a question about state ────────
  { q: "kisi ko interest bhej do", expect: null },
  { q: "reel kholo", expect: null },
  { q: "mujhe reel par le chalo", expect: null },
  { q: "kaise interest bhejte hain", expect: null },
  { q: "kyun ye rishta mere liye sahi hai", expect: null },

  // ── must NOT answer: too long to be one of these questions ─────────────
  {
    q: "aaj kitne rishtey hain aur unme se kaun mere liye sabse theek rahega bataiye",
    expect: null,
  },

  // ── must NOT answer: scoped conversation is about one person ────────────
  { q: "kya pending hai", expect: null, scoped: true },
  { q: "aaj kitne rishtey hain?", expect: null, scoped: true },
];

let failed = 0;
for (const c of CASES) {
  const got = matchGrioQuickAnswer({
    question: c.q,
    roster,
    pending,
    scoped: c.scoped ?? false,
  });
  const gotIntent = got?.intent ?? null;
  const ok = gotIntent === c.expect;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.scoped ? "[scoped] " : ""}"${c.q}"\n      expected=${c.expect ?? "model"}  got=${gotIntent ?? "model"}` +
      (got ? `\n      → ${got.text}` : ""),
  );
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`);
process.exit(failed === 0 ? 0 : 1);
