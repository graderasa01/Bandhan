import type { ConciergeMessage } from "~/shared/grio/concierge";
import type { GrioIntent } from "~/shared/grio/grioProfile";
import type { ConciergeRequestBody, GrioScope } from "./types";

/**
 * The `/api/concierge` body — the only place the app builds one.
 *
 * The limits are the route's own (`BodySchema` in app/api/concierge/route.ts):
 * a request over them is a 400 for the whole turn, so they are kept here rather
 * than hoped for.
 */
export const GRIO_MAX_TURNS = 12;
export const GRIO_MAX_MESSAGE_LENGTH = 1000;
/** `shownProfileIds` ceiling on the server. */
export const GRIO_MAX_SHOWN = 12;

export interface ConciergeBodyInput {
  /** The conversation as the model should read it, the question last. */
  transcript: ConciergeMessage[];
  scope: GrioScope | null;
  /** Where the current scope's conversation begins — a profile question carries only its own turns. */
  scopeStart: number;
  /** The cards on screen right now, so "pehli wali" resolves to what the member is looking at. */
  shownProfileIds: string[];
  /** The intent the last profile answer served, so a bare "aur batao" continues it. */
  lastIntent: GrioIntent | null;
}

/**
 * Builds the body exactly the way the web's `GrioChatCore.ask` does, with the
 * route's limits enforced instead of assumed:
 *
 *  - **One scope, by construction.** `GrioScope` is a union, so a match id and a
 *    candidate id cannot both be present — the route refuses that pair
 *    ("Ek request me sirf ek scope"), and there is no input here that produces it.
 *  - A candidate question sends only the turns since that profile came into
 *    scope, so the previous person's answers never ride along as context.
 *  - At most the last 12 turns, each clipped to the route's 1,000 characters.
 *    Clipping keeps the start of a long reply, which is where Grio's markers are
 *    written (the prompt puts them first). An over-long assistant turn used to
 *    be a 400 for the whole next question.
 *  - Empty turns are dropped (the route requires `min(1)`).
 */
export function buildConciergeBody(input: ConciergeBodyInput): ConciergeRequestBody {
  const { transcript, scope } = input;
  const scoped =
    scope?.kind === "candidate" && input.scopeStart > 0 && input.scopeStart < transcript.length
      ? transcript.slice(input.scopeStart)
      : transcript;

  const messages = scoped
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, GRIO_MAX_MESSAGE_LENGTH) }))
    .filter((m) => m.content.length > 0)
    .slice(-GRIO_MAX_TURNS);

  const body: ConciergeRequestBody = { messages };
  if (scope?.kind === "match") body.matchId = scope.matchId;
  if (scope?.kind === "candidate") {
    body.candidateProfileId = scope.profileId;
    if (input.lastIntent) body.lastIntent = input.lastIntent;
  }
  const shown = [...new Set(input.shownProfileIds.filter((id) => id.length > 0))].slice(0, GRIO_MAX_SHOWN);
  if (shown.length > 0) body.shownProfileIds = shown;
  return body;
}
