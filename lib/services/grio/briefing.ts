import "server-only";
import { getT } from "@/lib/i18n/server";
import { getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getTodayPollView } from "@/lib/services/vibe/pollService";
import { getCircleTeaser } from "@/lib/services/circle/circleService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { buildGrioRoster, type GrioRoster } from "./roster";
import { buildTodayBoard } from "@/lib/services/today/priorityEngine";

/**
 * What Grio says first, before anyone has typed anything.
 *
 * ## Why this is code and not a model call
 *
 * Every sentence below is a claim about the user's day — how many rishtey, whose
 * names, how many questions are waiting, when the Circle opens. A model asked to
 * compose this from the same facts would be correct most of the time and
 * confidently wrong the rest, and the failure is unusually costly here because a
 * greeting is the one message nobody reads sceptically. It is also the message
 * most likely to be *heard* rather than read — in live mode this is spoken
 * aloud, where there is no glancing back to check.
 *
 * So the model writes none of it. This assembles the sentence from rows, the
 * same discipline `consequences.ts` applies to "what happens if I do this" and
 * for the same stated reason: prose in a prompt is correct the day it is written
 * and silently wrong three releases later.
 *
 * The cost argument is a bonus rather than the point — opening the panel is now
 * free where a generated greeting would have been an AI call per open.
 *
 * ## Shape of the sentence
 *
 * Four beats, and the last one is the reason the other three exist:
 *
 *   1. **Aaj kitne aur kaun** — the count, then the names. Names are what make
 *      the follow-up sayable: "Priya ke baare me batao" needs to have heard
 *      "Priya".
 *   2. **Aaj khaas kya hai** — at most one thing, or it stops being special.
 *   3. **Kya intezaar kar raha hai** — only what someone is actually waiting on.
 *   4. **Ek sawaal** — combined into one flowing question rather than a stacked
 *      list, because this is meant to be answered out loud.
 */

/** Beyond this the list stops being sayable and becomes a recital. */
const MAX_NAMES_SPOKEN = 5;

export interface GrioBriefing {
  /** The greeting, ready to render as an assistant turn and to read aloud. */
  text: string;
  roster: GrioRoster;
}

/**
 * Joins names the way a person would: "A, B aur C".
 *
 * Worth a helper rather than a `join(", ")` because this string is spoken, and
 * a synthesiser reading "Priya, Anjali, Meera" ends on a rising comma-tone that
 * sounds like the list was cut off.
 */
function speakList(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} aur ${names[names.length - 1]}`;
}

export async function buildGrioBriefing(userId: string): Promise<GrioBriefing> {
  const t = await getT();

  // `generateReel: true` — this is the "what does today look like" request, so
  // building today's reel *is* the job. Same argument the walkthrough endpoint
  // makes for its own `getOrCreateTodayReel`; nothing is consumed, and a
  // generated reel is the same reel `/user/reel` will show.
  //
  // It reads alarming — generation runs the whole L0-L2 pipeline plus L3's
  // explanation calls — so the thing worth knowing is that it almost never
  // fires from here: `userDashboardData` already calls `getOrCreateTodayReel`,
  // and the dashboard is where every session starts. By the time anybody opens
  // Grio the row exists and this is a plain read. Generating is the rare
  // correct fallback, not the normal path.
  const roster = await buildGrioRoster(userId, { generateReel: true });

  // Interest, voice-note and silent-match counts used to be fetched here for
  // beat 3. The priority engine counts all three, so they were four queries
  // producing a number this file no longer decides anything with — removed
  // rather than left as a second, drifting source. `questions` survives because
  // beat 4 still reads it.
  const [questions, poll, circle] = await Promise.all([
    getInboundQuestions(userId, t).catch(() => []),
    // Gated exactly as the Vibe Hub itself is: a plan that cannot see the poll
    // must not be told about it, or the greeting becomes an upsell in disguise.
    (async () => {
      if (!(await isFeatureAvailable(userId, "mindsetArena")).allowed) return null;
      return getTodayPollView(userId, t).catch(() => null);
    })(),
    getCircleTeaser(userId).catch(() => null),
  ]);

  const parts: string[] = [];

  // ── 1. aaj kitne, aur kaun ────────────────────────────────────────────────
  const unseenNames = roster.entries
    .filter((e) => e.sources.includes("reel") && !e.seenToday)
    .map((e) => e.name);

  if (roster.reelTotal === 0) {
    parts.push(
      "Aaj ka reel abhi taiyar nahi hua — profile poori ho to roz naye rishtey apne aap aa jaate hain.",
    );
  } else if (roster.reelLeft === 0) {
    parts.push(`Aaj ke saare ${roster.reelTotal} rishtey aap dekh chuke hain — kal naye aayenge.`);
  } else {
    const shown = unseenNames.slice(0, MAX_NAMES_SPOKEN);
    const extra = unseenNames.length - shown.length;
    const names = shown.length
      ? ` — ${speakList(shown)}${extra > 0 ? ` aur ${extra} aur` : ""}`
      : "";
    parts.push(
      roster.reelLeft === roster.reelTotal
        ? `Aaj aapke liye ${roster.reelTotal} rishtey hain${names}.`
        : `Aaj ke ${roster.reelTotal} me se ${roster.reelLeft} rishtey abhi baaki hain${names}.`,
    );
  }

  // ── 2. aaj khaas kya hai ──────────────────────────────────────────────────
  //
  // At most one. Two "special" things in one breath is a newsletter, and the
  // second one is the one that makes the first sound like filler.
  const special = pickSpecial({ circle, pollUnanswered: poll !== null && poll.votedOptionIndex === null, poll });
  if (special) parts.push(special);

  /*
   * ── 3. kya intezaar kar raha hai ────────────────────────────────────────
   *
   * This beat used to build its own list — questions, then interests, then
   * voice notes, then silent matches — with its own idea of which mattered
   * most. That was one of three surfaces each deciding its own ordering: the
   * dashboard had another, and "aaj kya karun" in chat had a third. Three
   * answers to the same question is how a user learns not to trust any of them.
   *
   * The engine now decides, and this reads its top waiting item. The beat's
   * *shape* is unchanged — one spoken sentence, and only when somebody is
   * genuinely waiting — because that shape is what makes the greeting speakable
   * rather than a list read aloud.
   *
   * The board is best-effort: a greeting that loses one sentence is better than
   * a panel that fails to open.
   */
  const board = await buildTodayBoard(userId, { roster }).catch((err) => {
    console.error("[grio] briefing board failed:", err instanceof Error ? err.message : String(err));
    return null;
  });
  const waitingItem = board?.priorities.find(
    (p) => p.tier === "P1_WAITING_ON_ME" || p.tier === "P3_ACTIVE_RISHTA",
  );
  if (waitingItem) parts.push(`${waitingItem.title} — ${waitingItem.detail}`);

  // ── 4. ek sawaal ──────────────────────────────────────────────────────────
  parts.push(buildClosingQuestion({ hasRishtey: roster.reelLeft > 0, pendingQuestions: questions.length }));

  return { text: parts.join(" "), roster };
}

/**
 * The one thing worth calling out about today, or nothing.
 *
 * Ordered by how time-bound it is rather than how interesting it is: a Circle
 * that opens tonight cannot be caught up on tomorrow, while today's poll can be
 * answered any time before midnight.
 */
function pickSpecial(input: {
  circle: Awaited<ReturnType<typeof getCircleTeaser>>;
  pollUnanswered: boolean;
  poll: Awaited<ReturnType<typeof getTodayPollView>> | null;
}): string | null {
  const { circle, pollUnanswered, poll } = input;

  if (circle?.eligible && circle.status === "LIVE" && circle.awaitingMe > 0) {
    return `Serious Circle abhi chal raha hai aur ${circle.awaitingMe} log aapke jawab ka intezaar kar rahe hain.`;
  }
  // SCHEDULED is the only state where joining is still possible — LOCKED means
  // the roster froze 24 hours before the start, which is the commitment the
  // whole feature is built on. Telling somebody to register then would be an
  // invitation to a door that is already shut.
  if (circle?.eligible && circle.status === "SCHEDULED" && !circle.registered) {
    return `Aaj Serious Circle hai — ${circle.slotLabel}, aur registration abhi khula hai.`;
  }
  if (circle?.registered && (circle.status === "SCHEDULED" || circle.status === "LOCKED")) {
    return `Serious Circle me aapki jagah pakki hai — ${circle.slotLabel}.`;
  }
  if (pollUnanswered && poll) {
    // The tagline is the poll's own ("Shukravaar — jo rishta tod sakta hai"),
    // written by `pollService`. Not the question text: a question read out in a
    // greeting invites an answer to it right there, and the answer has to be
    // recorded against options the user has not heard.
    return `Aaj ka sawaal abhi baaki hai — ${poll.themeTagline}. Jawab dene se "soch ka mel" bharta hai.`;
  }
  return null;
}

/**
 * One question, not a menu.
 *
 * The temptation is to offer everything at once ("kya karna chahenge — rishtey
 * dekhein, sawaal ka jawab dein, ya message likhein?"). Spoken aloud that is a
 * list nobody holds in their head to the end, and the honest default is
 * whichever thing has a person waiting on the other side of it.
 */
function buildClosingQuestion(input: { hasRishtey: boolean; pendingQuestions: number }): string {
  const { hasRishtey, pendingQuestions } = input;

  if (pendingQuestions > 0 && hasRishtey) {
    return "Kiske baare me jaanna chahenge — ya pehle un sawaalon ka jawab de dein?";
  }
  if (pendingQuestions > 0) {
    return "Sawaalon ka jawab abhi de dein?";
  }
  if (hasRishtey) {
    return "Kiske baare me jaanna chahenge? Naam boliye ya \"sabse upar wala\" keh dijiye.";
  }
  return "Kuch poochhna ho to boliye.";
}
