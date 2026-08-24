/** Grio (formerly "AI Rishta Concierge", Phase E) — see app/api/concierge/route.ts. */

export interface ConciergeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConciergeResponse {
  ok: boolean;
  reply?: string;
  code?: "not_configured" | "upstream_error" | "bad_request";
  message?: string;
  /**
   * The numbered people the model was shown on *this* turn — see
   * `lib/services/grio/roster.ts`.
   *
   * Returned with the reply rather than fetched separately by the client, and
   * that is the whole reason `<<<WHO:n>>>` is safe to act on without a tap: the
   * list the model counted against and the list the client resolves against are
   * the same object from the same request. A client that fetched its own copy
   * could renumber between the two calls — one new inbound interest is enough —
   * and silently open the wrong person's profile.
   */
  roster?: ConciergeRosterEntry[];
}

/**
 * One row of that list. Name and id only, exactly like
 * `ConciergeWalkthroughStep` and for the identical reason: a human reads the
 * name, scope needs the id, and anything else would make it a list worth
 * comparing.
 */
export interface ConciergeRosterEntry {
  n: number;
  profileId: string;
  name: string;
}

/**
 * Grio's opening line — see GET /api/concierge/briefing.
 *
 * `ok: false` carries no message on purpose: a greeting that could not be built
 * is not something to report to a user who never asked for it. The panel simply
 * opens the way it always did.
 */
export interface ConciergeBriefingResponse {
  ok: boolean;
  text?: string;
  roster?: ConciergeRosterEntry[];
}

/** A chat-unlocked match Grio can draft-and-send a message to — see GET /api/concierge/matches. */
export interface ConciergeMatchOption {
  matchId: string;
  name: string;
  photoUrl: string | null;
}

/**
 * Someone a targeted action can land on when the conversation has no scope —
 * see GET /api/concierge/people.
 *
 * Deliberately a *different* list from `ConciergeMatchOption`: that one answers
 * "who can I message", this one answers "who have I already shown intent
 * toward", which is a wider set (shortlist + inbound interests) and a narrower
 * permission (an action, not a conversation).
 *
 * This list is fetched by the client and shown to the user. It never reaches
 * the model — which is the whole reason a picker is safe: the person is chosen
 * by a finger, not by a token.
 */
export interface ConciergePersonOption {
  profileId: string;
  name: string;
  /**
   * Why they are on this list, so the sheet can say so instead of presenting
   * two quite different relationships as one undifferentiated list.
   */
  source: "shortlist" | "interest_received" | "same_vote";
}

/**
 * One stop on the guided walk through today's reel — see
 * GET /api/concierge/walkthrough.
 *
 * Two fields on purpose. The name is here because a human reads it (the chip
 * that says whose turn it is); the id is here because scope needs one. Nothing
 * about the person — no age, city, score — because the moment this carried
 * attributes it would be a list the model could be tempted to compare, and the
 * single-candidate scope is the only thing standing between Grio and ranking.
 */
export interface ConciergeWalkthroughStep {
  profileId: string;
  name: string;
}

/** Marks a suggested-message span inside an assistant reply — parsed client-side into a Copy/Send card. */
export const SEND_MARKER_START = "<<<SEND>>>";
export const SEND_MARKER_END = "<<<END>>>";

/**
 * Marks a suggested Ask Bridge question, and shares `SEND_MARKER_END`.
 *
 * A second text-carrying marker rather than an `<<<ACT:ask:…>>>` argument,
 * because `lib/contracts/grio.ts` refuses structured arguments inside the
 * action marker and says why: *"If a future action needs structured arguments
 * it gets its own marker rather than making this one lossy."* This is that
 * future action. The text has to survive intact and stay editable up to the
 * last moment — `askProfileQuestion` allows exactly one question per candidate,
 * ever, so a question sent with a typo is a question that cannot be re-sent.
 */
export const ASK_MARKER_START = "<<<ASK>>>";

/**
 * "This reply is about roster #n" — the marker that lets a spoken sentence pick
 * a person.
 *
 * It carries an **ordinal, never an id**. The client looks the number up in the
 * `roster` the server built on this very turn, so the profile id is something
 * code produced at both ends and the model only ever counted. That keeps Phase
 * H's rule intact where it matters: an id still cannot arrive from a reply.
 *
 * What it *does* relax, deliberately, is who may point. Phase H's "the user
 * chooses the person" was written for actions that reach a stranger — an
 * interest, a voice note, a question — and it still governs every one of them:
 * those run through a confirm sheet that names the person before anything
 * leaves. Focusing the conversation on somebody reaches nobody. It is a scope
 * change, the same one tapping their card on the reel screen performs, and
 * demanding a tap for it was what made Grio answer "sabse zyada matching rishta
 * kaun hai" with "pehle select kariye" — a refusal with nothing behind it.
 *
 * Inert when it does not resolve, exactly like an unknown `<<<ACT:` key: a
 * `<<<WHO:99>>>` against a nine-person roster selects nobody and renders
 * nothing.
 */
export const WHO_MARKER_START = "<<<WHO:";
export const WHO_MARKER_END = ">>>";

/**
 * "The user asked for this by name — run it, don't offer it."
 *
 * The same catalog keys as `<<<ACT:`, a different promise about who initiated.
 * `<<<ACT:` means *Grio thought of this*, and it has always produced a chip;
 * `<<<DO:` means *the user said it out loud*, and it runs.
 *
 * Two markers rather than one auto-running marker, because the distinction is
 * the entire safety property. Grio proposes chips constantly and unprompted —
 * "aap Deep Profile analyze kar sakte hain", "Vibe Hub ka sawaal baaki hai" —
 * and those suggestions are why the chip exists. Auto-running every `<<<ACT:`
 * would fire actions nobody requested; the model has to state, per reply, which
 * side of that line it is on. It cannot do that with one marker.
 *
 * What this does *not* relax is who the action lands on. A targeted `<<<DO:`
 * still needs a profile id that came from code — the open profile, or a
 * `<<<WHO:n>>>` resolved against this turn's roster. With no target it degrades
 * to a chip and the picker asks, because "send it to whoever you think I meant"
 * is the one reading of an automatic action that cannot be taken back.
 */
export const DO_MARKER_START = "<<<DO:";

/**
 * "The user just answered a Marriage Intelligence question in conversation."
 *
 * `<<<LEARN:key=option>>>`. The body is a catalog key from
 * `lib/profile/intelligenceQuestions.ts` and one of *that question's own
 * options*, verbatim — never the model's paraphrase of what the user said.
 *
 * ## Why a marker and not a form
 *
 * The whole point of the intelligence layer is that a person will tell a
 * conversation things they will not fill into forty form fields. So when
 * somebody says "haan, bachche to definitely chahiye" in the middle of talking
 * about something else, the answer already exists — the only question is
 * whether the app is listening. This marker is the app listening.
 *
 * ## Why this is not the model writing to the profile
 *
 * Three gates, and none of them trust the model:
 *
 *  1. **It renders a card, not a write.** Same promise as `<<<ACT:` — nothing
 *     is saved until a tap. Grio proposing "I heard X" and the user confirming
 *     it is what makes the stored answer USER_ENTERED rather than an inference,
 *     which is the distinction `signalAnswers.ts` is built around.
 *  2. **The question text is code's.** The card shows the catalog's own wording
 *     and the catalog's own option, so the user is confirming a real answer to
 *     a real question — not agreeing to a sentence the model composed.
 *  3. **The server validates anyway.** `saveSignalAnswer` rejects an unknown
 *     key and any value outside that question's option list, so a hallucinated
 *     `<<<LEARN:>>>` is a 422, never a stored fact.
 *
 * An option the model gets slightly wrong ("6-12 months" for "6–12 months") is
 * therefore not a silent failure: the card falls back to showing every option
 * for the user to pick. That is deliberate — the usual silent-drop rule is
 * right for a button nobody asked for and wrong here, where the user has
 * already said the thing and dropping it means asking them again later.
 */
export const LEARN_MARKER_START = "<<<LEARN:";
