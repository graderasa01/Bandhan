import { createStore, type StoreApi } from "zustand/vanilla";
import { GRIO_OUTCOME_MATCHED, type GrioActionKey } from "~/shared/grio/grio";
import type { ConciergeMatchOption, ConciergeMessage, ConciergePersonOption, ConciergeRosterEntry } from "~/shared/grio/concierge";
import type { GrioIntent, GrioProfileAction, GrioProfileBriefResponse } from "~/shared/grio/grioProfile";
import type { GrioProfileCard } from "~/shared/grio/grioCards";
import type { DiscoverFilters } from "~/types/api";
import { callFor, navTargetOf, needsTarget, policyOf, specOf, websiteFor } from "./actionPolicy";
import { isCloseCommand } from "./commands";
import { learnQuestion } from "./learn";
import { planReply, type RunPlan, type TurnPlan } from "./plan";
import { buildConciergeBody, GRIO_MAX_MESSAGE_LENGTH } from "./request";
import { ASK_ABOUT, WALK_ASK } from "./starters";
import {
  GrioOfflineError,
  type GrioDataEvent,
  type GrioDraft,
  type GrioEffects,
  type GrioEntry,
  type GrioMessage,
  type GrioOrigin,
  type GrioPending,
  type GrioScope,
  type GrioTarget,
  type GrioTransport,
  type GrioUndo,
  type GrioWalk,
  type TurnSource,
} from "./types";

/**
 * GrioTurnEngine — the app's one way to talk to Grio.
 *
 * Typed text, a chip, "Ask Grio" on a reel card or a profile, "Ask Grio" in a
 * chat, and the foreground voice loop all call the same `ask()`. There is no
 * second prompt and no rule of Grio's own here: the brain is the server's
 * `/api/concierge`, the button list is the web's catalog, and this engine is
 * the web panel's conversation logic (`GrioChatCore`) without the web:
 *
 *   - the transcript is resent each turn (there is no server-side history),
 *     trimmed to the route's limits by `buildConciergeBody`;
 *   - a reply is read by the web's own parser into a plan (`planReply`): the
 *     one `<<<DO:>>>`, the people it points at by roster number, drafts,
 *     searches, the focus hop;
 *   - every action runs through the row's own existing endpoint, and what
 *     happened is written back into the transcript in code's words, so the
 *     next turn knows it happened.
 *
 * Pure TypeScript over a vanilla store. The app hands in the doors
 * (`GrioTransport`) and the side effects (`GrioEffects`); the checks hand in
 * fakes of both.
 */

export interface GrioState {
  messages: GrioMessage[];
  /** "Ab baat: Priya ki profile" — keyed by the message index it sits above. */
  dividers: Record<number, string>;
  scope: GrioScope | null;
  /** Where the current scope's conversation begins. */
  scopeStart: number;
  lastIntent: GrioIntent | null;
  /** The numbered people the server showed the model on the last turn — the only list `<<<WHO:n>>>` resolves against. */
  roster: ConciergeRosterEntry[];
  /** The cards on screen right now, sent with every turn. */
  shown: string[];
  hopUsed: boolean;
  /** A turn is in flight. */
  sending: boolean;
  /** An action is in flight — one at a time. */
  running: boolean;
  error: { message: string; code: string | null } | null;
  /** The opening briefing was asked for in this conversation. */
  briefed: boolean;
  /** The pinned header + opening chips for the profile in scope. */
  brief: { profileId: string; data: GrioProfileBriefResponse | null } | null;
  pending: GrioPending | null;
  /** Chips already carried out, by `${messageId}:${key}` — nothing is fired twice by mistake. */
  completed: Record<string, true>;
  /** Opened from Search: the member's own filters, for "Show these profiles". */
  discovery: { summary: string | null; filters: DiscoverFilters } | null;
  walk: GrioWalk | null;
  /** The Grio room is on screen. */
  visible: boolean;
}

export interface AskOptions {
  source?: TurnSource;
  /** Asked with this scope, not the current one — the hop and the walkthrough set it atomically. */
  scopeOverride?: GrioScope;
  /** Re-ask a question already on screen (the focus hop) without showing it twice. */
  silent?: boolean;
}

export interface GrioEngine {
  store: StoreApi<GrioState>;
  /** Grio opened from somewhere — that place's context becomes the conversation's. */
  open(entry: GrioEntry, opts?: { ask?: string }): void;
  /** The room mounted / unmounted. */
  setVisible(visible: boolean): void;
  ask(text: string, opts?: AskOptions): Promise<void>;
  setScope(scope: GrioScope | null): void;
  tapChip(messageId: string, key: GrioActionKey): Promise<void>;
  tapProfileAction(messageId: string, action: GrioProfileAction): void;
  openDraft(messageId: string, kind: "send" | "ask", text: string): void;
  confirmPending(text?: string): Promise<void>;
  cancelPending(): void;
  pickPerson(person: ConciergePersonOption): Promise<void>;
  pickMatch(match: ConciergeMatchOption): void;
  saveLearn(messageId: string, key: string, value: string): Promise<boolean>;
  undo(messageId: string): Promise<void>;
  forget(messageId: string, index: number): Promise<void>;
  cardShortlist(messageId: string, card: GrioProfileCard, on: boolean): Promise<boolean>;
  cardInterest(messageId: string, card: GrioProfileCard): void;
  askAbout(person: GrioTarget): void;
  startWalkthrough(): Promise<void>;
  nextStep(): void;
  endWalkthrough(): void;
  showDiscoveryResults(): Promise<void>;
  openWebsiteFor(key: GrioActionKey, target: GrioTarget | null): void;
  /** Close the room; the conversation stays for next time. */
  dismiss(): void;
  /** A card's own doors — the profile and the chat, through the same guard as every navigation. */
  openProfile(profileId: string): void;
  openChat(matchId: string): void;
  /** Send the last question again after a failed turn (no duplicate on screen). */
  retry(): Promise<void>;
  /** A fresh conversation (and, on sign-out, nothing of the last member left behind). */
  reset(): void;
  transport: GrioTransport;
}

const NETWORK_LINE = "Network error — dobara try karein.";
const NO_REPLY_LINE = "Jawab nahi mila — dobara try karein.";
const ACTION_FAILED_LINE = "Nahi ho paya — dobara try karein.";
const FIND_FAILED_LINE = "Search abhi nahi chal payi — Search screen se dhoondh sakte hain.";

function initialState(): GrioState {
  return {
    messages: [],
    dividers: {},
    scope: null,
    scopeStart: 0,
    lastIntent: null,
    roster: [],
    shown: [],
    hopUsed: false,
    sending: false,
    running: false,
    error: null,
    briefed: false,
    brief: null,
    pending: null,
    completed: {},
    discovery: null,
    walk: null,
    visible: false,
  };
}

function scopeKey(scope: GrioScope | null): string {
  return !scope ? "none" : scope.kind === "candidate" ? `c:${scope.profileId}` : `m:${scope.matchId}`;
}

function dividerLabel(scope: GrioScope | null): string {
  if (!scope) return "Ab general baat";
  return scope.kind === "candidate" ? `Ab baat: ${scope.name} ki profile` : `Ab baat: ${scope.name} ke liye message`;
}

export function chipId(messageId: string, key: GrioActionKey): string {
  return `${messageId}:${key}`;
}

/** What changed on the server after a catalog row ran, so cached screens catch up. */
function eventFor(key: GrioActionKey, target: GrioTarget | null, res: { matched: boolean; matchId: string | null }): GrioDataEvent | null {
  if (key === "shortlistProfile" && target) return { kind: "shortlist", profileId: target.profileId, on: true };
  if (key === "sendInterestToProfile" && target) {
    return { kind: "interest", profileId: target.profileId, matched: res.matched, matchId: res.matchId };
  }
  if (!needsTarget(key)) return { kind: "self" };
  return null;
}

export function createGrioEngine(transport: GrioTransport, effects: GrioEffects): GrioEngine {
  const store = createStore<GrioState>(() => initialState());
  const get = store.getState;
  const set = (patch: Partial<GrioState> | ((s: GrioState) => Partial<GrioState>)) => store.setState(patch);
  let seq = 0;
  /** Bumped by `reset()` — a reply that lands after a reset belongs to a conversation that no longer exists. */
  let epoch = 0;
  const nextId = () => `g${Date.now().toString(36)}${(++seq).toString(36)}`;

  /* ---------------------------------------------------------------- */
  /* the transcript                                                    */
  /* ---------------------------------------------------------------- */

  function append(message: Omit<GrioMessage, "id">): GrioMessage {
    const full = { ...message, id: nextId() } as GrioMessage;
    set((s) => ({ messages: [...s.messages, full] }));
    return full;
  }

  function patch(id: string, update: (m: GrioMessage) => Partial<GrioMessage>) {
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...update(m) } : m)) }));
  }

  /**
   * What just happened, written into the conversation by code — in Grio's
   * voice, never the model narrating its own success. The transcript is what
   * the model reads next turn; without this line Grio keeps offering a button
   * the member already pressed.
   */
  function appendOutcome(line: string, tone: GrioMessage["tone"], extra?: { undo?: GrioUndo }): GrioMessage {
    return append({ role: "assistant", kind: "outcome", content: line, tone, ...(extra?.undo ? { undo: extra.undo } : {}) });
  }

  function turnsOf(messages: GrioMessage[]): ConciergeMessage[] {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  function showCards(messageId: string, profileIds: string[]) {
    if (profileIds.length === 0) return;
    patch(messageId, () => ({ cards: profileIds }));
    set({ shown: profileIds });
  }

  /* ---------------------------------------------------------------- */
  /* scope                                                             */
  /* ---------------------------------------------------------------- */

  function setScope(next: GrioScope | null) {
    const s = get();
    if (scopeKey(s.scope) === scopeKey(next)) {
      // Same person or thread: keep the conversation, take the fresher name.
      if (next && s.scope) set({ scope: next });
      return;
    }
    const at = s.messages.length;
    set({
      scope: next,
      scopeStart: at,
      lastIntent: null,
      dividers: at > 0 ? { ...s.dividers, [at]: dividerLabel(next) } : s.dividers,
      brief: next?.kind === "candidate" && s.brief?.profileId === next.profileId ? s.brief : null,
    });
    if (next?.kind === "candidate" && get().visible) void loadBrief(next.profileId);
  }

  async function loadBrief(profileId: string) {
    const current = get().brief;
    if (current?.profileId === profileId && current.data?.ok) return;
    set({ brief: { profileId, data: null } });
    let data: GrioProfileBriefResponse;
    try {
      data = await transport.profileBrief(profileId);
    } catch {
      data = { ok: false };
    }
    if (get().brief?.profileId === profileId) set({ brief: { profileId, data } });
  }

  /**
   * Grio speaks first — code-composed, no model (`/api/concierge/briefing`).
   * Once per conversation, and not when it opened on someone specific: a
   * greeting about the whole day would sit on top of that question.
   */
  async function maybeBrief() {
    const s = get();
    if (s.briefed || s.messages.length > 0 || s.scope) return;
    set({ briefed: true });
    const mine = epoch;
    try {
      const res = await transport.briefing();
      if (mine !== epoch || !res?.ok || !res.text) return;
      if (get().messages.length > 0) return; // the member spoke first — they win
      append({ role: "assistant", kind: "briefing", content: res.text });
      if (res.roster) set({ roster: res.roster });
    } catch {
      /* the room simply opens the way it always did */
    }
  }

  function open(entry: GrioEntry, opts?: { ask?: string }) {
    set({ error: null });
    switch (entry.kind) {
      case "candidate":
        set({ discovery: null });
        setScope({ kind: "candidate", profileId: entry.profileId, name: entry.name, source: entry.source });
        void loadBrief(entry.profileId);
        break;
      case "match":
        set({ discovery: null });
        setScope({ kind: "match", matchId: entry.matchId, name: entry.name });
        break;
      case "discovery":
        setScope(null);
        set({ discovery: { summary: entry.summary, filters: entry.filters } });
        break;
      default:
        setScope(null);
        set({ discovery: null });
    }
    void maybeBrief();
    const question = opts?.ask?.trim();
    if (question) void ask(question, { source: "entry" });
  }

  function setVisible(visible: boolean) {
    set({ visible });
    const s = get();
    if (visible && s.scope?.kind === "candidate") void loadBrief(s.scope.profileId);
  }

  /* ---------------------------------------------------------------- */
  /* the turn                                                          */
  /* ---------------------------------------------------------------- */

  async function ask(text: string, opts: AskOptions = {}) {
    const content = text.trim().slice(0, GRIO_MAX_MESSAGE_LENGTH);
    const source = opts.source ?? "typed";
    if (!content || get().sending) return;

    // "Grio band karo" is about the screen, not a question for the brain.
    if (!opts.silent && isCloseCommand(content)) {
      dismiss();
      return;
    }

    const active = opts.scopeOverride ?? get().scope;
    const silent = opts.silent ?? false;
    const mine = epoch;
    set({ error: null, sending: true });
    if (!silent) append({ role: "user", kind: "turn", content, source });

    let hop: GrioScope | null = null;
    try {
      const s = get();
      const transcript = turnsOf(s.messages);
      // The hop re-asks a question already on screen; the model must still
      // read it as the trailing turn.
      const full = silent ? [...transcript, { role: "user" as const, content }] : transcript;
      const body = buildConciergeBody({
        transcript: full,
        scope: active,
        scopeStart: s.scopeStart,
        shownProfileIds: s.shown,
        lastIntent: active?.kind === "candidate" ? s.lastIntent : null,
      });
      const res = await transport.concierge(body);
      if (mine !== epoch) return;
      if (!res.ok || !res.reply) {
        set({ error: { message: res.message ?? NO_REPLY_LINE, code: res.code } });
        return;
      }

      // Replaced wholesale: the server renumbers each turn, and one stale row
      // would be two people answering to the same number.
      const roster = res.roster ?? get().roster;
      if (res.roster) set({ roster: res.roster });

      const plan = planReply({ reply: res.reply, roster, scope: active, hopUsed: get().hopUsed, sendTarget: res.sendTarget });
      const reply = append({
        role: "assistant",
        kind: "turn",
        content: res.reply,
        ...(res.intent
          ? {
              meta: {
                intent: res.intent,
                profileId: res.profileId,
                evidence: res.evidence,
                profileActions: res.profileActions,
                followUps: res.followUps,
                answeredBy: res.answeredBy,
              },
            }
          : {}),
        ...(plan.send?.target ? { sendTarget: plan.send.target } : {}),
        ...(active?.kind === "candidate" ? { askTarget: { profileId: active.profileId, name: active.name } } : {}),
      });
      set({ lastIntent: res.intent });
      if (res.header && active?.kind === "candidate" && res.header.profileId === active.profileId) {
        const header = res.header;
        set((st) =>
          st.brief?.profileId === header.profileId && st.brief.data?.ok
            ? { brief: { profileId: header.profileId, data: { ...st.brief.data, header } } }
            : {},
        );
      }

      for (const fact of plan.remember) void rememberFact(reply.id, fact);

      const acted = await carryOut(plan.run, reply.id);
      const handled = await handlePeople(plan, reply.id);
      hop = acted || handled ? null : plan.hop;
      // The face of the person the hop is about to talk about, under the one-line ack.
      if (hop?.kind === "candidate") showCards(reply.id, [hop.profileId]);

      // "Full profile kholo" on an open profile: the server's own intent
      // engine read it as navigation, about the profile in scope — the door is
      // the profile screen, opened as asked.
      if (
        !hop &&
        res.intent === "NAVIGATION" &&
        active?.kind === "candidate" &&
        res.profileId === active.profileId &&
        res.profileActions.some((a) => a.kind === "view_profile")
      ) {
        go(`/profile/${encodeURIComponent(active.profileId)}`);
      }
    } catch (err) {
      if (mine === epoch) set({ error: { message: err instanceof GrioOfflineError ? err.message : NETWORK_LINE, code: "network" } });
    } finally {
      if (mine === epoch) set({ sending: false });
    }

    if (mine !== epoch) return;
    if (hop) {
      set({ hopUsed: true });
      setScope(hop);
      // Same words, now with the person in scope — so the answer comes back with
      // what the first call had no way to load.
      await ask(content, { scopeOverride: hop, silent: true, source });
    } else {
      set({ hopUsed: false });
    }
  }

  /** Navigates, or says why it cannot (a member whose profile is not live yet). */
  function go(route: string): boolean {
    const ok = effects.navigate(route);
    if (!ok) effects.toast("info", "Ye profile live hone ke baad khulega.");
    return ok;
  }

  /**
   * The one `<<<DO:>>>` of a reply. Returns whether it was taken up — run, or
   * its confirm / picker / explanation opened — so the reply does not also hop.
   */
  async function carryOut(run: RunPlan | null, messageId: string): Promise<boolean> {
    if (!run) return false;
    switch (run.kind) {
      case "remember":
        void rememberFact(messageId, run.fact);
        return true;
      case "navigate":
        patch(messageId, () => ({ ranRun: true }));
        go(run.route);
        return true;
      case "chip":
        // A website page never opens by itself — the chip stays for a tap.
        return true;
      case "execute":
        await execute(run.key, run.target, messageId, "do");
        // Reported, not retried: a refused action is not turned into a chip
        // that would post to the same endpoint and fail the same way.
        patch(messageId, () => ({ ranRun: true }));
        return true;
      case "confirm":
        if (!get().pending) set({ pending: { kind: "confirm", key: run.key, target: run.target, messageId, origin: "do" } });
        return true;
      case "pick":
        if (!get().pending) set({ pending: { kind: "pickPerson", then: { kind: "action", key: run.key, messageId, origin: "do" } } });
        return true;
      case "unavailable":
        if (!get().pending) set({ pending: { kind: "unavailable", key: run.key, target: run.target } });
        return true;
    }
  }

  /** `<<<SHOW:>>>`, a SEND to a roster match, `<<<FIND:>>>`. Every id is code's. */
  async function handlePeople(plan: TurnPlan, messageId: string): Promise<boolean> {
    let handled = false;
    if (plan.show.length > 0) {
      showCards(messageId, plan.show);
      handled = true;
    }
    if (plan.send?.openEditor && plan.send.target) {
      // Asked for by name: the editor opens at once — still editable, still a tap to send.
      if (!get().pending) {
        set({ pending: { kind: "draft", draft: { kind: "send", target: plan.send.target }, text: plan.send.text, messageId } });
      }
      handled = true;
    }
    if (plan.find) {
      await runFind(plan.find);
      handled = true;
    }
    return handled;
  }

  /* ---------------------------------------------------------------- */
  /* actions                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Runs one catalog row through its own endpoint — the web's `runGrioAction`.
   * The endpoint's gate is the authority (quota, plan, ownership, blocks), not
   * the fact that Grio offered it or the member asked.
   */
  async function execute(key: GrioActionKey, target: GrioTarget | null, messageId: string | null, origin: GrioOrigin): Promise<boolean> {
    if (get().running) return false;
    const call = callFor(key, target);
    if (!call) {
      // A targeted row with nobody chosen is a caller bug, never a request to guess.
      effects.toast("error", ACTION_FAILED_LINE);
      return false;
    }
    set({ running: true });
    try {
      const res = await transport.run(call);
      if (!res.ok) {
        const line = res.message ?? ACTION_FAILED_LINE;
        effects.haptic("warn");
        effects.toast("error", line);
        appendOutcome(line, "error");
        return false;
      }
      const spec = specOf(key);
      if (messageId) set((s) => ({ completed: { ...s.completed, [chipId(messageId, key)]: true } }));
      effects.haptic("success");
      effects.toast("success", res.matched ? "It's a match! 🎉" : (spec.done ?? "Ho gaya ✓"));
      const base = spec.outcome ?? spec.done ?? null;
      if (base) {
        const line = res.matched ? `✓ ${base} ${GRIO_OUTCOME_MATCHED}` : `✓ ${base}`;
        // A card names its person: the model never saw who a finger picked from
        // a picker, but a card came from the roster or a search it was told of.
        const undoCall = policyOf(key).undo;
        appendOutcome(origin === "card" && target ? `${target.name}: ${line}` : line, "success", {
          ...(undoCall && target ? { undo: { kind: "shortlist", target, done: false } } : {}),
        });
      }
      const event = eventFor(key, target, res);
      if (event) effects.refresh(event);
      return true;
    } catch (err) {
      effects.toast("error", err instanceof GrioOfflineError ? err.message : NETWORK_LINE);
      return false;
    } finally {
      set({ running: false });
    }
  }

  /** A person was settled for a targeted row — go as far as its tier allows. */
  async function proceed(key: GrioActionKey, target: GrioTarget | null, messageId: string | null, origin: GrioOrigin) {
    const tier = policyOf(key).tier;
    if (tier === "unavailable") {
      set({ pending: { kind: "unavailable", key, target } });
      return;
    }
    if (tier === "private") {
      set({ pending: null });
      await execute(key, target, messageId, origin);
      return;
    }
    set({ pending: { kind: "confirm", key, target, messageId, origin } });
  }

  async function tapChip(messageId: string, key: GrioActionKey) {
    const s = get();
    if (s.completed[chipId(messageId, key)] || s.running) return;
    const tier = policyOf(key).tier;
    effects.haptic("tap");

    if (tier === "navigate") {
      const target = navTargetOf(key);
      if (!target) return;
      if (target.kind === "app") go(target.route);
      else effects.openWebsite(target.path);
      return;
    }
    if (tier === "memory") return;

    if (needsTarget(key)) {
      // A match scope is not a target: these rows take a profile, and a matched
      // person is past the point where any of them would make sense (web rule).
      const open = s.scope?.kind === "candidate" ? { profileId: s.scope.profileId, name: s.scope.name } : null;
      if (!open) {
        set({ pending: { kind: "pickPerson", then: { kind: "action", key, messageId, origin: "chip" } } });
        return;
      }
      await proceed(key, open, messageId, "chip");
      return;
    }
    await proceed(key, null, messageId, "chip");
  }

  function tapProfileAction(messageId: string, action: GrioProfileAction) {
    if (action.kind === "ask") {
      void ask(action.prompt, { source: "chip" });
      return;
    }
    if (action.kind === "catalog") {
      void tapChip(messageId, action.actionKey);
      return;
    }
    // view_profile / open_section / open_kundli — the app's profile screen shows
    // every section (and the kundli notes) this member may see.
    const message = get().messages.find((m) => m.id === messageId);
    const profileId = message?.meta?.profileId;
    if (profileId) go(`/profile/${encodeURIComponent(profileId)}`);
  }

  /* ---------------------------------------------------------------- */
  /* drafts: a message or a question, always edited before it leaves   */
  /* ---------------------------------------------------------------- */

  function openDraft(messageId: string, kind: "send" | "ask", text: string) {
    const s = get();
    const message = s.messages.find((m) => m.id === messageId);
    if (kind === "send") {
      const target = message?.sendTarget ?? (s.scope?.kind === "match" ? { matchId: s.scope.matchId, name: s.scope.name } : null);
      set({ pending: target ? { kind: "draft", draft: { kind: "send", target }, text, messageId } : { kind: "pickMatch", text, messageId } });
      return;
    }
    const target = message?.askTarget ?? (s.scope?.kind === "candidate" ? { profileId: s.scope.profileId, name: s.scope.name } : null);
    set({
      pending: target
        ? { kind: "draft", draft: { kind: "ask", target }, text, messageId }
        : { kind: "pickPerson", then: { kind: "ask", text, messageId } },
    });
  }

  async function sendDraft(draft: GrioDraft, text: string) {
    const body = text.trim();
    if (!body || get().running) return;
    set({ running: true });
    try {
      if (draft.kind === "send") {
        const res = await transport.sendMessage(draft.target.matchId, body);
        if (!res.ok) {
          const line = res.message ?? "Bhej nahi paye — dobara try karein.";
          effects.haptic("warn");
          effects.toast("error", line);
          appendOutcome(line, "error");
          return;
        }
        effects.haptic("success");
        effects.toast("success", `Bhej diya ${draft.target.name} ko ✓`);
        appendOutcome(`✓ Message ${draft.target.name} ko bhej diya gaya hai.`, "success");
        effects.refresh({ kind: "message", matchId: draft.target.matchId });
        return;
      }
      const res = await transport.askQuestion(draft.target.profileId, body);
      if (!res.ok) {
        const line = res.message ?? "Sawaal nahi bheja ja saka — dobara try karein.";
        effects.haptic("warn");
        effects.toast("error", line);
        appendOutcome(line, "error");
        return;
      }
      if (res.alreadyAsked) {
        // One question per person, ever — a repeat is a no-op, never "sent".
        effects.toast("info", "Aap inse pehle hi ek sawaal poochh chuke hain.");
        appendOutcome("Inse pehle hi ek sawaal poochha ja chuka hai — ek insaan se sirf ek hi sawaal jaata hai.", "info");
        return;
      }
      effects.haptic("success");
      effects.toast(res.heldForReview ? "info" : "success", res.heldForReview ? "Sawaal review me hai" : "Sawaal bhej diya");
      appendOutcome(
        res.heldForReview
          ? "✓ Sawaal bhej diya gaya hai — check hote hi unhe pahunch jayega."
          : "✓ Sawaal bhej diya gaya hai. Jab tak wo jawab na dein, unhe aapka naam nahi dikhega.",
        "success",
      );
      effects.refresh({ kind: "question", profileId: draft.target.profileId });
    } catch (err) {
      effects.toast("error", err instanceof GrioOfflineError ? err.message : NETWORK_LINE);
    } finally {
      set({ running: false });
    }
  }

  async function confirmPending(text?: string) {
    const p = get().pending;
    if (!p || get().running) return;
    if (p.kind === "confirm") {
      await execute(p.key, p.target, p.messageId, p.origin);
      set({ pending: null });
      return;
    }
    if (p.kind === "draft") {
      set({ pending: null });
      await sendDraft(p.draft, text ?? p.text);
      return;
    }
    set({ pending: null });
  }

  function cancelPending() {
    if (get().running) return;
    set({ pending: null });
  }

  async function pickPerson(person: ConciergePersonOption) {
    const p = get().pending;
    if (p?.kind !== "pickPerson") return;
    const target = { profileId: person.profileId, name: person.name };
    if (p.then.kind === "ask") {
      set({ pending: { kind: "draft", draft: { kind: "ask", target }, text: p.then.text, messageId: p.then.messageId } });
      return;
    }
    await proceed(p.then.key, target, p.then.messageId, p.then.origin);
  }

  function pickMatch(match: ConciergeMatchOption) {
    const p = get().pending;
    if (p?.kind !== "pickMatch") return;
    const target = { matchId: match.matchId, name: match.name };
    // As on the web: picking the thread makes the conversation about it.
    setScope({ kind: "match", ...target });
    set({ pending: { kind: "draft", draft: { kind: "send", target }, text: p.text, messageId: p.messageId } });
  }

  /* ---------------------------------------------------------------- */
  /* LEARN, remember, undo                                             */
  /* ---------------------------------------------------------------- */

  async function saveLearn(messageId: string, key: string, value: string): Promise<boolean> {
    const question = learnQuestion(key);
    if (!question || get().running) return false;
    set({ running: true });
    try {
      const res = await transport.learn(key, value);
      if (!res.ok) {
        effects.toast("error", res.message ?? "Jawab save nahi hua — dobara try karein.");
        return false;
      }
      patch(messageId, (m) => ({ learned: { ...(m.learned ?? {}), [key]: value } }));
      effects.toast("success", "Yaad rakh liya");
      appendOutcome(`✓ ${question.label}: ${value} — profile me save ho gaya.`, "success");
      effects.refresh({ kind: "self" });
      return true;
    } catch (err) {
      effects.toast("error", err instanceof GrioOfflineError ? err.message : NETWORK_LINE);
      return false;
    } finally {
      set({ running: false });
    }
  }

  /**
   * `remember` is saved as the web saves it — the model only offers it for
   * something the member just said about themselves — but here it is shown
   * under the reply with Undo, so nothing is kept that the member cannot see.
   */
  async function rememberFact(messageId: string, fact: string) {
    try {
      const res = await transport.remember(fact);
      if (!res.ok) return; // a full list or a hiccup is not worth interrupting over
      patch(messageId, (m) => ({ remembered: [...(m.remembered ?? []), { fact, itemId: res.itemId, undone: false }] }));
    } catch {
      /* silent, as on the web */
    }
  }

  async function forget(messageId: string, index: number) {
    const item = get().messages.find((m) => m.id === messageId)?.remembered?.[index];
    if (!item || item.undone || !item.itemId) return;
    try {
      const ok = await transport.forget(item.itemId);
      if (!ok) {
        effects.toast("error", ACTION_FAILED_LINE);
        return;
      }
      patch(messageId, (m) => ({ remembered: (m.remembered ?? []).map((r, i) => (i === index ? { ...r, undone: true } : r)) }));
      effects.toast("success", "Grio ab ye yaad nahi rakhega");
    } catch (err) {
      effects.toast("error", err instanceof GrioOfflineError ? err.message : NETWORK_LINE);
    }
  }

  async function undo(messageId: string) {
    const message = get().messages.find((m) => m.id === messageId);
    const u = message?.undo;
    if (!u || u.done || get().running) return;
    const call = policyOf("shortlistProfile").undo?.(u.target.profileId);
    if (!call) return;
    set({ running: true });
    try {
      const res = await transport.run(call);
      if (!res.ok) {
        effects.toast("error", res.message ?? ACTION_FAILED_LINE);
        return;
      }
      patch(messageId, () => ({ undo: { ...u, done: true } }));
      effects.toast("success", "Shortlist se hata diya");
      appendOutcome("✓ Wo profile shortlist se hata di gayi hai.", "info");
      effects.refresh({ kind: "shortlist", profileId: u.target.profileId, on: false });
    } catch (err) {
      effects.toast("error", err instanceof GrioOfflineError ? err.message : NETWORK_LINE);
    } finally {
      set({ running: false });
    }
  }

  /* ---------------------------------------------------------------- */
  /* people cards                                                      */
  /* ---------------------------------------------------------------- */

  /** A card is the member choosing the person with their own finger — no picker needed. */
  async function cardShortlist(messageId: string, card: GrioProfileCard, on: boolean): Promise<boolean> {
    const target = { profileId: card.profileId, name: card.name };
    if (on) return execute("shortlistProfile", target, messageId, "card");
    if (get().running) return false;
    const call = policyOf("shortlistProfile").undo?.(card.profileId);
    if (!call) return false;
    set({ running: true });
    try {
      const res = await transport.run(call);
      if (!res.ok) {
        effects.toast("error", res.message ?? ACTION_FAILED_LINE);
        return false;
      }
      effects.toast("success", "Shortlist se hataya");
      effects.refresh({ kind: "shortlist", profileId: card.profileId, on: false });
      return true;
    } catch (err) {
      effects.toast("error", err instanceof GrioOfflineError ? err.message : NETWORK_LINE);
      return false;
    } finally {
      set({ running: false });
    }
  }

  function cardInterest(messageId: string, card: GrioProfileCard) {
    set({
      pending: {
        kind: "confirm",
        key: "sendInterestToProfile",
        target: { profileId: card.profileId, name: card.name },
        messageId,
        origin: "card",
      },
    });
  }

  function askAbout(person: GrioTarget) {
    const next: GrioScope = { kind: "candidate", profileId: person.profileId, name: person.name, source: "chat" };
    setScope(next);
    void ask(ASK_ABOUT.replace("{name}", person.name), { scopeOverride: next, source: "chip" });
  }

  /* ---------------------------------------------------------------- */
  /* search                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * `<<<FIND:>>>` through the same two doors Search uses — sentence → filters,
   * filters → people. One engine, one gender floor, one photo gate. The line
   * written back is code's: the parser's summary and the engine's own count.
   */
  async function runFind(query: string) {
    try {
      const intent = await transport.discoverIntent(query);
      if (!intent.ok) {
        appendOutcome(intent.message ?? FIND_FAILED_LINE, "error");
        return;
      }
      const found = await transport.discoverSearch(intent.filters, intent.behaviorMode);
      if (!found.ok) {
        appendOutcome(found.message ?? FIND_FAILED_LINE, "error");
        return;
      }
      const skipped = intent.unresolved.length > 0 ? ` (Ye filter nahi ban saka: ${intent.unresolved.join(", ")})` : "";
      const line =
        found.profileIds.length > 0
          ? `🔎 ${intent.summary} — ${found.countLabel} mile.${skipped}`
          : `🔎 ${intent.summary} — abhi koi nahi mila. Filters thode dheele karke dekhein.${skipped}`;
      const out = appendOutcome(line, "info");
      showCards(out.id, found.profileIds);
    } catch (err) {
      appendOutcome(err instanceof GrioOfflineError ? err.message : FIND_FAILED_LINE, "error");
    }
  }

  /** "Show these profiles" from Search — the member's own filters, exactly, no model involved. */
  async function showDiscoveryResults() {
    const d = get().discovery;
    if (!d || get().sending) return;
    set({ sending: true, error: null });
    try {
      const found = await transport.discoverSearch(d.filters, null);
      const label = d.summary?.trim() || "Aapki search";
      if (!found.ok) {
        appendOutcome(found.message ?? FIND_FAILED_LINE, "error");
        return;
      }
      const out = appendOutcome(
        found.profileIds.length > 0 ? `🔎 ${label} — ${found.countLabel} mile.` : `🔎 ${label} — abhi koi nahi mila. Filters thode dheele karke dekhein.`,
        "info",
      );
      showCards(out.id, found.profileIds);
    } catch (err) {
      appendOutcome(err instanceof GrioOfflineError ? err.message : FIND_FAILED_LINE, "error");
    } finally {
      set({ sending: false });
    }
  }

  /* ---------------------------------------------------------------- */
  /* the walk through today                                            */
  /* ---------------------------------------------------------------- */

  function openStep(walk: GrioWalk) {
    const step = walk.steps[walk.index];
    if (!step) return;
    const stepScope: GrioScope = { kind: "candidate", profileId: step.profileId, name: step.name, source: "chat" };
    setScope(stepScope);
    set({ walk });
    void ask(WALK_ASK, { scopeOverride: stepScope, source: "chip" });
  }

  async function startWalkthrough() {
    if (get().sending) return;
    try {
      const steps = await transport.walkthrough();
      if (steps.length === 0) {
        // Not an error: a finished reel is the normal end of a good day.
        appendOutcome("✓ Aaj ke saare rishtey dekh liye — kal naye aayenge.", "info");
        return;
      }
      openStep({ steps, index: 0 });
    } catch (err) {
      effects.toast("error", err instanceof GrioOfflineError ? err.message : NETWORK_LINE);
    }
  }

  function endWalkthrough() {
    set({ walk: null });
    setScope(null);
  }

  function nextStep() {
    const walk = get().walk;
    if (!walk || get().sending) return;
    const index = walk.index + 1;
    if (index >= walk.steps.length) {
      endWalkthrough();
      appendOutcome("✓ Aaj ke saare rishtey dekh liye.", "info");
      return;
    }
    openStep({ steps: walk.steps, index });
  }

  function openWebsiteFor(key: GrioActionKey, target: GrioTarget | null) {
    const path = websiteFor(key, target);
    if (path) effects.openWebsite(path);
    set({ pending: null });
  }

  /** Close the room — the ✕, Android back's twin, and "Grio band karo". The conversation stays. */
  function dismiss() {
    if (get().running) return;
    set({ pending: null });
    effects.dismiss();
  }

  function openProfile(profileId: string) {
    go(`/profile/${encodeURIComponent(profileId)}`);
  }

  function openChat(matchId: string) {
    go(`/chat/${encodeURIComponent(matchId)}`);
  }

  async function retry() {
    const s = get();
    const last = s.messages[s.messages.length - 1];
    if (!s.error || s.sending || !last || last.role !== "user") return;
    // The question is taken off and asked again, so it is on screen once.
    set({ messages: s.messages.slice(0, -1), error: null });
    await ask(last.content, { source: last.source ?? "typed" });
  }

  function reset() {
    epoch++;
    const visible = get().visible;
    store.setState({ ...initialState(), visible }, true);
  }

  const engine: GrioEngine = {
    store,
    open,
    setVisible,
    ask,
    setScope,
    tapChip,
    tapProfileAction,
    openDraft,
    confirmPending,
    cancelPending,
    pickPerson,
    pickMatch,
    saveLearn,
    undo,
    forget,
    cardShortlist,
    cardInterest,
    askAbout,
    startWalkthrough,
    nextStep,
    endWalkthrough,
    showDiscoveryResults,
    openWebsiteFor,
    dismiss,
    openProfile,
    openChat,
    retry,
    reset,
    transport,
  };
  return engine;
}
