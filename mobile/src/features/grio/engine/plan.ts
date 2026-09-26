import { parseGrioSegments, type GrioActionKey, type GrioSegment } from "~/shared/grio/grio";
import type { ConciergeRosterEntry } from "~/shared/grio/concierge";
import { navTargetOf, needsTarget, policyOf, specOf } from "./actionPolicy";
import type { GrioMessage, GrioScope, GrioSendTarget, GrioTarget } from "./types";

/**
 * Reading one Grio reply into what the app should do — pure, so every rule in
 * it is checked (`mobile/scripts/grio-check.ts`).
 *
 * The reply is parsed by the web's own `parseGrioSegments` (vendored), so an
 * unknown key or marker is dropped exactly as on the web. What this adds is the
 * app's half of the web's `runRequestedAction` / `handlePeopleMarkers` /
 * `resolveHop`: where a target comes from, and how far each tier may go.
 *
 * ## Where a person comes from
 *
 * Only three places, all of them code: the profile the member opened (the
 * scope), a `<<<WHO:n>>>` looked up in the roster the server returned **with
 * this reply**, or — when neither settles it — the picker, where a finger
 * decides. A marker's free-text argument is never read as an id, and a number
 * the roster does not have points at nobody.
 *
 * One rule is stricter than the web's: with a profile open, a `<<<WHO:n>>>` for
 * somebody *else* no longer loses silently to the open profile — the two
 * disagree about who was meant, so the picker asks.
 */

export type RunPlan =
  /** An in-app screen the member asked for. */
  | { kind: "navigate"; key: GrioActionKey; route: string }
  /** Private and reversible, on a person code resolved — runs now, with Undo. */
  | { kind: "execute"; key: GrioActionKey; target: GrioTarget }
  /** Reaches a person, spends a credit, or pings a human — the confirm sheet. */
  | { kind: "confirm"; key: GrioActionKey; target: GrioTarget | null }
  /** Lands on one person and nobody unambiguous is in view — the picker. */
  | { kind: "pick"; key: GrioActionKey }
  /** No screen for it in the app yet — explained, with where it can be done. */
  | { kind: "unavailable"; key: GrioActionKey; target: GrioTarget | null }
  | { kind: "remember"; fact: string }
  /** A website page — offered as a chip, never opened by itself. */
  | { kind: "chip"; key: GrioActionKey };

export interface TurnPlan {
  segments: GrioSegment[];
  /** `remember` facts to save (offered or asked — the web saves both). */
  remember: string[];
  /** The one `<<<DO:>>>` of this reply, decided. */
  run: RunPlan | null;
  /** The roster person a `<<<WHO:n>>>` named, when the number is real. */
  who: ConciergeRosterEntry | null;
  /** `<<<SHOW:>>>` — ids in roster order, never the model's order. */
  show: string[];
  /** The first `<<<SEND>>>` with the thread it goes to, when the reply itself settled it. */
  send: { text: string; target: GrioSendTarget | null; openEditor: boolean } | null;
  /** `<<<FIND:>>>` — the member's request, restated, for the Discovery engine. */
  find: string | null;
  /** Re-ask with this person in scope (the focus hop) — null when anything else was handled. */
  hop: GrioScope | null;
}

export interface PlanInput {
  reply: string;
  /** The roster that came back with this reply — the one list its ordinals count against. */
  roster: ConciergeRosterEntry[];
  scope: GrioScope | null;
  /** One focus hop per question; a second pointer is the model wandering. */
  hopUsed: boolean;
  /** The server's own thread for this reply's `<<<SEND>>>` (profile path, open chat). */
  sendTarget: GrioSendTarget | null;
}

type Of<T extends GrioSegment["type"]> = Extract<GrioSegment, { type: T }>;

function first<T extends GrioSegment["type"]>(segments: GrioSegment[], type: T): Of<T> | undefined {
  return segments.find((s): s is Of<T> => s.type === type);
}

/** The person a targeted action lands on — or null when code cannot say without guessing. */
export function resolveTarget(scope: GrioScope | null, who: ConciergeRosterEntry | null): GrioTarget | null {
  const open = scope?.kind === "candidate" ? { profileId: scope.profileId, name: scope.name } : null;
  if (open && who && who.profileId !== open.profileId) return null; // two different people meant — ask
  if (open) return open;
  return who ? { profileId: who.profileId, name: who.name } : null;
}

function planRun(key: GrioActionKey, arg: string | null, scope: GrioScope | null, who: ConciergeRosterEntry | null): RunPlan | null {
  const tier = policyOf(key).tier;

  if (tier === "memory") return arg ? { kind: "remember", fact: arg } : null;

  if (tier === "navigate") {
    const target = navTargetOf(key);
    if (!target) return null;
    return target.kind === "app" ? { kind: "navigate", key, route: target.route } : { kind: "chip", key };
  }

  const target = needsTarget(key) ? resolveTarget(scope, who) : null;
  if (tier === "unavailable") return { kind: "unavailable", key, target };
  if (needsTarget(key) && !target) return { kind: "pick", key };
  if (tier === "private" && target) return { kind: "execute", key, target };
  return { kind: "confirm", key, target };
}

export function planReply(input: PlanInput): TurnPlan {
  const segments = parseGrioSegments(input.reply);
  const { roster, scope } = input;

  const whoSeg = first(segments, "who");
  const who = whoSeg ? (roster.find((r) => r.n === whoSeg.n) ?? null) : null;

  const remember = segments
    .filter((s): s is Of<"action"> | Of<"run"> => (s.type === "action" || s.type === "run") && specOf(s.key).kind === "remember")
    .map((s) => s.arg)
    .filter((a): a is string => Boolean(a));

  // One per reply, as on the web: a second spoken action in one breath is the
  // one the member did not watch happen. The rest stay chips.
  const runSeg = segments.find((s): s is Of<"run"> => s.type === "run" && specOf(s.key).kind !== "remember");
  const run = runSeg ? planRun(runSeg.key, runSeg.arg, scope, who) : null;

  const showSeg = first(segments, "show");
  const show = showSeg
    ? showSeg.ns.map((n) => roster.find((r) => r.n === n)?.profileId).filter((id): id is string => Boolean(id))
    : [];

  const sendSeg = first(segments, "send");
  let send: TurnPlan["send"] = null;
  /** A draft addressed to a roster match is a complete answer — it never hops (the web's rule). */
  let sendToMatch = false;
  if (sendSeg) {
    // A roster match named in this very reply is the member asking for a
    // message to *them* — the editor opens straight away (still editable,
    // still a tap to send). Otherwise the server's thread, or the open match.
    const viaWho = who?.matchId ? { matchId: who.matchId, name: who.name } : null;
    const target = viaWho ?? input.sendTarget ?? (scope?.kind === "match" ? { matchId: scope.matchId, name: scope.name } : null);
    // Not when the reply offers options to choose from, and not inside that
    // very chat's conversation — there the drafts are cards to pick, and the
    // member opens the one they want.
    const options = segments.filter((s) => s.type === "send").length > 1;
    const alreadyThere = scope?.kind === "match" && viaWho !== null && scope.matchId === viaWho.matchId;
    send = { text: sendSeg.value, target, openEditor: viaWho !== null && !options && !alreadyThere };
    sendToMatch = viaWho !== null;
  }

  const findSeg = first(segments, "find");
  const find = findSeg ? findSeg.query : null;

  const handled = show.length > 0 || sendToMatch || find !== null;
  let hop: GrioScope | null = null;
  if (!runSeg && !handled && !input.hopUsed && who) {
    const already = scope?.kind === "candidate" && scope.profileId === who.profileId;
    if (!already) hop = { kind: "candidate", profileId: who.profileId, name: who.name, source: "chat" };
  }

  return { segments, remember, run, who, show, send, find, hop };
}

/**
 * The chips under a reply: what Grio offered, a `<<<DO:>>>` that did not run
 * (its picker is the "who did you mean?"), and the catalog rows a profile
 * answer came with. Never `remember`, never twice, and never a key the catalog
 * does not have — the parser already dropped those.
 */
export function chipsFor(message: GrioMessage, segments: GrioSegment[]): GrioActionKey[] {
  const keys: GrioActionKey[] = [];
  for (const s of segments) {
    if (s.type !== "action" && !(s.type === "run" && !message.ranRun)) continue;
    if (specOf(s.key).kind === "remember") continue;
    if (!keys.includes(s.key)) keys.push(s.key);
  }
  for (const a of message.meta?.profileActions ?? []) {
    if (a.kind === "catalog" && specOf(a.actionKey).kind !== "remember" && !keys.includes(a.actionKey)) keys.push(a.actionKey);
  }
  return keys;
}

/**
 * The prose of one text segment, safe to put on screen.
 *
 * The web parser already strips whole unknown markers; this also removes the
 * fragment a reply cut off mid-marker leaves at its end (`… <<<WH`), and any
 * lone delimiter — so no raw marker syntax is ever printed.
 */
export function displayText(value: string): string {
  return value
    .replace(/<<<[^>]*>>>/g, "")
    .replace(/<<<[^\n]*$/g, "")
    .replace(/<<<|>>>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
