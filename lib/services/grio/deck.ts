import "server-only";
import { getLockedVoiceNotes } from "@/lib/services/voice/voiceNoteService";
import { getInboundQuestions } from "@/lib/services/askBridge/profileQuestionService";
import { getPlanContext } from "@/lib/services/plans/entitlements";
import { getLedger } from "@/lib/services/rewards/rewardService";
import { getTodayMissionEligible, buildMissionHeadline } from "@/lib/services/match/missionService";
import {
  DECK_MAX_CARDS,
  DECK_MAX_SELL_CARDS,
  SELL_CARD_KINDS,
  urgentMsLeft,
  type GrioDeck,
  type GrioDeckCard,
} from "@/lib/contracts/grioDeck";

/**
 * Builds the Grio Deck — see `lib/contracts/grioDeck.ts` for the four rules
 * this file exists to keep.
 *
 * ## Why there is no AI here, and no scoring either
 *
 * Every card is a row that already exists, surfaced by a query that already
 * exists. Nothing is ranked, predicted, or written by a model; the order below
 * is a fixed list in source, which is what makes it reviewable. That is the
 * same call `reelData.ts` makes for the mission prompt and `definitions.ts`
 * makes for quests — the copy and the trigger are product decisions, so they
 * live where someone has to read them to change them.
 *
 * ## The order, and why this one
 *
 * A locked voice note goes first because it is the only card where a real
 * person is already waiting on the other side and the user is the one holding
 * it up. A pending question is second: also a real person, but the deadline is
 * days rather than the note's none, and answering costs the user more than
 * tapping unlock does. `dailyMission` is third — nobody is waiting yet, it is
 * a suggestion to *start* something, which is a smaller claim than the two
 * cards above it. `expiringCredit` is last and conditional on the other two —
 * see below.
 *
 * ## Why `dailyMission` carries no candidate data
 *
 * The headline ("87% match — aaj ke sabse strong rishton me se ek") never
 * names a person, city, or any other attribute — it is the exact string
 * `reelData.ts` already puts on the reel card, built by the same
 * `buildMissionHeadline` (Phase G9, `missionService.ts`). That sharing is
 * itself the safety property: this file could not leak more than the reel
 * already shows even if it tried, because it never receives more than that
 * one pre-built sentence. The per-candidate "what to say" suggestion
 * (`ReelMission.suggestion`) stays reel-only — building it needs the
 * viewer's profile and the candidate's shared-tag overlap, which `deck.ts`
 * has no reason to fetch just to answer "is there a mission today".
 *
 * ## Why `expiringCredit` only appears when there is no locked note
 *
 * A `VOICE_UNLOCK` credit and a locked voice note are two halves of the same
 * transaction; if both exist, the `lockedVoiceNote` card already *is* the
 * "spend it" prompt (`deckUnlockLabel` reads the credit count into that card's
 * own button). A second card nagging about the same credit would be the deck
 * repeating itself. This card exists for the other case — the credit was
 * earned but nothing has arrived to spend it on yet — where otherwise it is
 * invisible until either a note shows up or the 24h grant quietly lapses.
 *
 * Also skipped when the plan already grants free unlocks
 * (`plan.features.voiceUnlock`): the credit is doing nothing for that user
 * regardless of whether it expires, so flagging its countdown would be
 * anxiety about a number that was never going to matter (see
 * `unlockVoiceNote`, which only spends a credit when the plan doesn't already
 * cover it).
 *
 * ## Rationing is enforced here, not in the UI
 *
 * `DECK_MAX_CARDS` and `DECK_MAX_SELL_CARDS` are applied while building, so a
 * second surface that renders this deck cannot accidentally show three cards
 * by looping over the array. The UI's job is to draw what it is handed.
 */
export async function buildGrioDeck(userId: string): Promise<GrioDeck> {
  const [lockedNotes, questions, plan, ledger, mission] = await Promise.all([
    // Only ever DECK_MAX_SELL_CARDS of these can be shown, so there is no
    // reason to read more than that from the database.
    getLockedVoiceNotes(userId, DECK_MAX_SELL_CARDS),
    getInboundQuestions(userId),
    getPlanContext(userId),
    getLedger(userId),
    // Read-only — see missionService.ts's getTodayMissionEligible header for
    // why this never triggers a day's reel generation.
    getTodayMissionEligible(userId),
  ]);

  const cards: GrioDeckCard[] = [];
  let sellCardsLeft = DECK_MAX_SELL_CARDS;

  for (const note of lockedNotes) {
    if (cards.length >= DECK_MAX_CARDS || sellCardsLeft <= 0) break;
    cards.push({
      kind: "lockedVoiceNote",
      id: note.id,
      teaser: note.teaser,
      isAnswer: note.isAnswer,
      seconds: note.seconds,
      createdAt: note.createdAt.toISOString(),
    });
    if (SELL_CARD_KINDS.includes("lockedVoiceNote")) sellCardsLeft--;
  }

  for (const question of questions) {
    if (cards.length >= DECK_MAX_CARDS) break;
    cards.push({
      kind: "pendingQuestion",
      id: question.id,
      teaser: question.teaser,
      questionText: question.questionText,
      expiresAt: question.expiresAt,
      createdAt: question.createdAt,
    });
  }

  if (cards.length < DECK_MAX_CARDS && mission.length > 0) {
    cards.push({ kind: "dailyMission", headline: buildMissionHeadline(Math.round(mission[0].finalScore)) });
  }

  // See the "Why expiringCredit only appears when there is no locked note"
  // note above for both conditions guarding this block.
  if (cards.length < DECK_MAX_CARDS && lockedNotes.length === 0 && !plan.features.voiceUnlock) {
    const atRisk = ledger.filter(
      (g) => g.kind === "VOICE_UNLOCK" && g.expiresAt !== null && urgentMsLeft(g.expiresAt.toISOString()) !== null,
    );
    if (atRisk.length > 0) {
      // Both fields describe the same at-risk subset — the count and the
      // countdown must agree, so neither is computed from the full ledger.
      const soonest = atRisk.reduce((a, b) => (a.expiresAt! < b.expiresAt! ? a : b));
      cards.push({
        kind: "expiringCredit",
        count: atRisk.reduce((sum, g) => sum + g.remaining, 0),
        expiresAt: soonest.expiresAt!.toISOString(),
      });
    }
  }

  return {
    cards,
    canUnlockFree: plan.features.voiceUnlock,
    unlockCredits: plan.credits.VOICE_UNLOCK,
  };
}
