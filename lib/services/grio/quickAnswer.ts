import type { GrioRoster } from "./roster";
import type { PendingBriefing } from "./pending";

/**
 * The questions Grio answers without asking a model anything.
 *
 * ## Why this exists
 *
 * A handful of questions get asked far more than all the others put together —
 * "aaj kya hai", "kitne rishtey bache", "kya pending hai", "sabse upar kaun".
 * Every one of them has a single correct answer that is already sitting in
 * memory by the time the route reaches `callAi`: the roster was built, the
 * pending items were counted. Sending that to a model so it can read the
 * numbers back costs a paid call and, measured on this route, between two and
 * fifteen seconds.
 *
 * That delay is survivable when the answer is read. It is not survivable when
 * it is *heard* — in live mode the user has spoken and is now sitting in
 * silence, and silence is the one thing a voice interface cannot afford. This
 * is the same argument `briefing.ts` already makes for the opening greeting;
 * this file extends it from "the first thing Grio says" to "the things Grio is
 * asked most".
 *
 * ## Pure by design
 *
 * No queries, no `prisma`, no `await`. It is handed what the route already
 * fetched and returns a sentence or null. That is what makes it free: a quick
 * answer costs nothing beyond the work the request was doing anyway, so
 * matching can be attempted on every turn without a budget conversation.
 *
 * ## The matching is deliberately timid
 *
 * The two failure directions are not symmetric. A miss costs one ordinary AI
 * call — the user gets a good answer, slowly, exactly as before. A false match
 * hands somebody a canned count when they asked something else, and it does so
 * *confidently*. So every rule below is written to refuse when unsure: short
 * messages only, no roster name mentioned, no action verb, and the whole
 * message has to look like the question rather than merely contain it. "Aaj
 * kitne rishtey hain" matches; "aaj ke rishton me se Priya ke baare me batao"
 * must not, and it is the second one these guards exist for.
 */

export interface GrioQuickAnswer {
  text: string;
  /** Which rule fired — carried so the route can log what it skipped a model for. */
  intent: string;
}

export interface QuickAnswerInput {
  /** The user's latest message, raw. */
  question: string;
  roster: GrioRoster | null;
  pending: PendingBriefing | null;
  /**
   * True when the conversation is scoped to one candidate or match. Every rule
   * here answers about the user's day as a whole, and inside a scoped
   * conversation "kitne bache hain" is much more likely to be about the person
   * on screen — so scope switches the whole file off rather than being handled
   * rule by rule.
   */
  scoped: boolean;
}

/** Past this it is a sentence with a request inside it, not one of these questions. */
const MAX_WORDS = 9;

/**
 * Anything that makes the message a *request* rather than a question about
 * state. Present in any form, the whole file declines: these want an action or
 * a person, and both are the model's job.
 */
const ACTION_WORDS = [
  "bhej",
  "kar do",
  "kardo",
  "karo",
  "kholo",
  "khol do",
  "le chal",
  "dikha do",
  "likh",
  "shortlist kar",
  "record",
  "poochh",
  "pooch",
  "batao ki",
  "samjha",
  "kaise",
  "kyun",
  "kyu ",
  "why",
  "how",
];

function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[?!.,|—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Joins names the way a person would — the same rule and the same reason as
 * `briefing.ts`: a synthesiser reading "Priya, Anjali, Meera" ends on a rising
 * comma-tone that sounds like the list was cut off.
 */
function speakList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} aur ${names[names.length - 1]}`;
}

/** Beyond this a spoken list becomes a recital. Matches `briefing.ts`. */
const MAX_NAMES_SPOKEN = 5;

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

export function matchGrioQuickAnswer(input: QuickAnswerInput): GrioQuickAnswer | null {
  const { roster, pending, scoped } = input;
  if (scoped) return null;

  const q = normalise(input.question);
  if (!q) return null;
  if (q.split(" ").length > MAX_WORDS) return null;
  if (hasAny(q, ACTION_WORDS)) return null;

  // A named person means the user wants that person, not a tally — and the
  // roster is the only place a name Grio knows can come from.
  if (roster?.entries.some((e) => e.name && q.includes(e.name.toLowerCase()))) return null;

  // ── "sabse upar kaun" ─────────────────────────────────────────────────────
  //
  // Answerable only because the order is code's. `roster.ts` already permits
  // reading #1 out loud for exactly this reason ("ye code ka hisaab hai, aapki
  // raay nahi"), and a fixed sentence cannot drift into the comparison that
  // rule forbids the way generated prose can.
  if (
    hasAny(q, ["sabse upar", "sabse uper", "sabse zyada matching", "sabse achha match", "top match", "number 1", "number one"]) &&
    roster &&
    roster.entries.length > 0
  ) {
    const top = roster.entries[0];
    const score = top.score !== null ? ` Match score ${Math.round(top.score)} me se 100.` : " Inka match score abhi naapa nahi gaya.";
    return {
      intent: "top_match",
      text: `Code ke hisaab se sabse upar ${top.name} hain.${score} Kis ke baare me jaanna chahenge?`,
    };
  }

  // ── "kitne rishtey / kaun kaun hai aaj" ──────────────────────────────────
  if (
    hasAny(q, ["kitne rishte", "kitne rishtey", "kitni profile", "kitne log", "aaj ke rishte", "aaj ke rishtey", "reel me kya", "kaun kaun"]) &&
    roster
  ) {
    return { intent: "reel_count", text: describeReel(roster) };
  }

  // ── "kya pending hai / kya baaki hai" ─────────────────────────────────────
  if (hasAny(q, ["pending", "baki kya", "baaki kya", "kya baki", "kya baaki", "intezaar"])) {
    if (!pending) {
      return {
        intent: "pending_none",
        text: "Abhi kuch pending nahi hai — na koi sawaal, na koi interest jiska jawab dena ho. Sab clear hai.",
      };
    }
    return { intent: "pending", text: `${pending.lines.join(" ")} Inme se kis par shuru karein?` };
  }

  // ── "aaj kya hai / kuch naya" ─────────────────────────────────────────────
  //
  // Last because it is the broadest: anything above that also matches here
  // deserves the narrower, more useful answer.
  if (hasAny(q, ["aaj kya", "kya naya", "kuch naya", "kya chal raha", "kya haal", "whats new", "what's new", "update kya"])) {
    const bits: string[] = [];
    if (roster) bits.push(describeReel(roster));
    if (pending) bits.push(pending.lines[0]);
    if (bits.length === 0) return null;
    return { intent: "today", text: `${bits.join(" ")} Kis par nazar daalein?` };
  }

  return null;
}

/** One sentence about today's reel, shaped by which of the three states it is in. */
function describeReel(roster: GrioRoster): string {
  if (roster.reelTotal === 0) {
    return "Aaj ka reel abhi taiyar nahi hua hai.";
  }
  if (roster.reelLeft === 0) {
    return `Aaj ke saare ${roster.reelTotal} rishtey aap dekh chuke hain — kal naye aayenge.`;
  }

  const unseen = roster.entries
    .filter((e) => e.sources.includes("reel") && !e.seenToday)
    .map((e) => e.name)
    .filter(Boolean);
  const shown = unseen.slice(0, MAX_NAMES_SPOKEN);
  const extra = unseen.length - shown.length;
  const names = shown.length ? ` — ${speakList(shown)}${extra > 0 ? ` aur ${extra} aur` : ""}` : "";

  return roster.reelLeft === roster.reelTotal
    ? `Aaj aapke liye ${roster.reelTotal} rishtey hain${names}.`
    : `Aaj ke ${roster.reelTotal} me se ${roster.reelLeft} abhi baaki hain${names}.`;
}
