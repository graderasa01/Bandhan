/**
 * The app's Grio engine, checked without a phone, a server or a model.
 *
 *   cd .. && npx tsx --tsconfig mobile/tsconfig.json mobile/scripts/grio-check.ts
 *   (or `npm run check-grio` in mobile/)
 *
 * What is pinned here is the safety surface: that the web's own parser and
 * catalog are what the app reads; that no id, URL or label ever comes from a
 * model's text; that a targeted action with no unambiguous person opens the
 * picker instead of guessing; that an interest or a message never leaves
 * without the member's confirm; and that typed, chip and spoken turns reach
 * the same result. The engine runs against a scripted transport and recorded
 * effects — the same engine object the app mounts.
 */
import { GRIO_ACTIONS, parseGrioSegments, type GrioActionKey } from "../src/shared/grio/grio";
import type { ConciergeRosterEntry } from "../src/shared/grio/concierge";
import { GRIO_MOBILE_POLICY, callFor, labelOf, navTargetOf, policyOf } from "../src/features/grio/engine/actionPolicy";
import { isCloseCommand } from "../src/features/grio/engine/commands";
import { createGrioEngine, chipId } from "../src/features/grio/engine/engine";
import { learnQuestion, matchLearnOption } from "../src/features/grio/engine/learn";
import { chipsFor, displayText, planReply } from "../src/features/grio/engine/plan";
import { buildConciergeBody, GRIO_MAX_MESSAGE_LENGTH } from "../src/features/grio/engine/request";
import { parseConciergeResponse } from "../src/features/grio/engine/schemas";
import {
  GrioOfflineError,
  type ConciergeRequestBody,
  type ConciergeTurnResult,
  type GrioDataEvent,
  type GrioEffects,
  type GrioMessage,
  type GrioTransport,
} from "../src/features/grio/engine/types";

let failed = 0;
let passed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? `\n      got: ${JSON.stringify(detail)}` : ""}`);
}
function eq(label: string, got: unknown, want: unknown) {
  check(label, JSON.stringify(got) === JSON.stringify(want), { got, want });
}

const ROSTER: ConciergeRosterEntry[] = [
  { n: 1, profileId: "p_ananya", name: "Ananya Mehta", matchId: null },
  { n: 2, profileId: "p_priya", name: "Priya Iyer", matchId: null },
  { n: 3, profileId: "p_neha", name: "Neha Verma", matchId: null },
  { n: 4, profileId: "p_riya", name: "Riya Shah", matchId: "m_riya" },
];

/* ------------------------------------------------------------------ */
console.log("── parser + display (the web's own parseGrioSegments) ──");

eq("DO marker becomes a run segment", parseGrioSegments("<<<DO:sendInterestToProfile>>> Theek hai").map((s) => s.type), ["run", "text"]);
{
  const segs = parseGrioSegments("Ye lijiye <<<NAV:/settings/delete>>> aur <<<do:x>>> bas");
  const text = segs.filter((s) => s.type === "text").map((s) => ("value" in s ? displayText(s.value) : "")).join(" ");
  check("unknown markers (any case) never reach the screen", !text.includes("<<<") && !text.includes(">>>") && text.includes("Ye lijiye"), text);
}
eq("a reply cut mid-marker shows no fragment", displayText("Theek hai <<<WH"), "Theek hai");
eq("a lone delimiter is not printed", displayText("a >>> b"), "a  b");
{
  const segs = parseGrioSegments("<<<SEND>>>Namaste ji");
  check("unterminated SEND keeps the words, drops the marker", segs.length === 1 && segs[0]!.type === "text" && displayText((segs[0] as { value: string }).value) === "Namaste ji", segs);
}
check("an action key the catalog lacks is inert", !parseGrioSegments("<<<ACT:deleteAccount>>><<<DO:payNow>>><<<ACT:unlockContact>>>").some((s) => s.type === "action" || s.type === "run"));
{
  const segs = parseGrioSegments("<<<ACT:openReel:https://evil.example/pay>>>");
  const a = segs.find((s) => s.type === "action") as { key: GrioActionKey; arg: string | null } | undefined;
  check("a marker argument is carried as text only", a?.key === "openReel" && a.arg === "https://evil.example/pay", segs);
  eq("…the chip's label is the catalog's", labelOf("openReel"), GRIO_ACTIONS.openReel.label);
  eq("…and its destination is the catalog href's app screen, not the argument", navTargetOf("openReel"), { kind: "app", route: "/reels" });
}
check("WHO with an id instead of a number points at nobody", !parseGrioSegments("<<<WHO:p_evil>>>").some((s) => s.type === "who"));
check("WHO with a name beside the number points at nobody", !parseGrioSegments("<<<WHO:2 Priya>>>").some((s) => s.type === "who"));
{
  const plan = planReply({ reply: "<<<SHOW:3,1,99>>>Ye rahe.", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("SHOW resolves in roster order and drops a number the roster lacks", plan.show, ["p_ananya", "p_neha"]);
}
{
  const plan = planReply({ reply: 'Abhi "Pay now" dabaiye! <<<ACT:openSubscription>>>', roster: [], scope: null, hopUsed: false, sendTarget: null });
  const msg: GrioMessage = { id: "m1", role: "assistant", kind: "turn", content: "" };
  const chips = chipsFor(msg, plan.segments);
  check("a model's own call-to-action text never becomes a button label", chips.length === 1 && labelOf(chips[0]!) === "Plans & billing", chips);
  eq("…and the plans page is a website link, never opened by itself", navTargetOf("openSubscription")?.kind, "web");
}

/* ------------------------------------------------------------------ */
console.log("\n── policy (typed against the web catalog) ──");

eq("every catalog row has a mobile tier", Object.keys(GRIO_MOBILE_POLICY).sort(), Object.keys(GRIO_ACTIONS).sort());
check(
  "nothing that pays, deletes or unlocks is in the catalog",
  !Object.keys(GRIO_ACTIONS).some((k) => /delete|pay|purchase|refund|unlock|subscribe|buy|withdraw/i.test(k) && k !== "openSubscription"),
);
eq("an interest is social (always confirmed)", policyOf("sendInterestToProfile").tier, "social");
eq("the shortlist is private and undoable", [policyOf("shortlistProfile").tier, Boolean(policyOf("shortlistProfile").undo)], ["private", true]);
eq("a boost spends a credit — confirmed", policyOf("activateBoost").tier, "self");
eq("a targeted call with nobody chosen is no call at all", callFor("sendInterestToProfile", null), null);
eq("a targeted call is built by the catalog row from code's id", callFor("sendInterestToProfile", { profileId: "p_priya", name: "Priya" }), {
  url: "/api/interests",
  method: "POST",
  body: { profileId: "p_priya" },
});
for (const key of Object.keys(GRIO_ACTIONS) as GrioActionKey[]) {
  if (policyOf(key).tier !== "navigate") continue;
  const target = navTargetOf(key);
  check(`nav ${key} resolves (${target?.kind === "app" ? target.route : target?.path})`, target !== null && (target.kind === "web" || target.route.startsWith("/")));
}

/* ------------------------------------------------------------------ */
console.log("\n── planner: who does an action land on? ──");

const PRIYA_SCOPE = { kind: "candidate" as const, profileId: "p_priya", name: "Priya Iyer" };
{
  const p = planReply({ reply: "<<<DO:shortlistProfile>>>Theek hai.", roster: ROSTER, scope: PRIYA_SCOPE, hopUsed: false, sendTarget: null });
  eq("shortlist on the open profile runs on it", p.run, { kind: "execute", key: "shortlistProfile", target: { profileId: "p_priya", name: "Priya Iyer" } });
}
{
  const p = planReply({ reply: "<<<DO:shortlistProfile>>>Kis ko?", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("shortlist with nobody in view opens the picker", p.run, { kind: "pick", key: "shortlistProfile" });
}
{
  const p = planReply({ reply: "<<<WHO:2>>>\n<<<DO:shortlistProfile>>>", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("shortlist naming roster #2 runs on #2", p.run, { kind: "execute", key: "shortlistProfile", target: { profileId: "p_priya", name: "Priya Iyer" } });
}
{
  const p = planReply({ reply: "<<<WHO:3>>>\n<<<DO:shortlistProfile>>>", roster: ROSTER, scope: PRIYA_SCOPE, hopUsed: false, sendTarget: null });
  eq("open profile and a different WHO disagree → picker, never a guess", p.run, { kind: "pick", key: "shortlistProfile" });
}
{
  const p = planReply({ reply: "<<<WHO:2>>>\n<<<DO:sendInterestToProfile>>>", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("an interest is never sent from a reply — it opens the confirm", p.run, { kind: "confirm", key: "sendInterestToProfile", target: { profileId: "p_priya", name: "Priya Iyer" } });
}
{
  const p = planReply({ reply: "<<<DO:sendInterestToProfile:p_evil>>>", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("a forged id in the marker is ignored → picker", p.run, { kind: "pick", key: "sendInterestToProfile" });
}
{
  const p = planReply({ reply: "<<<WHO:99>>>\n<<<DO:sendInterestToProfile>>>", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("a roster number that does not exist → picker", p.run, { kind: "pick", key: "sendInterestToProfile" });
  eq("…and no hop to nobody", p.hop, null);
}
eq(
  "asked navigation runs to the app screen",
  planReply({ reply: "<<<DO:openReel>>>", roster: [], scope: null, hopUsed: false, sendTarget: null }).run,
  { kind: "navigate", key: "openReel", route: "/reels" },
);
eq(
  "asked navigation to a website page stays a chip",
  planReply({ reply: "<<<DO:openSubscription>>>", roster: [], scope: null, hopUsed: false, sendTarget: null }).run,
  { kind: "chip", key: "openSubscription" },
);
eq(
  "a recorder the app lacks is explained, on the open person",
  planReply({ reply: "<<<DO:sendVoiceNote>>>", roster: [], scope: PRIYA_SCOPE, hopUsed: false, sendTarget: null }).run,
  { kind: "unavailable", key: "sendVoiceNote", target: { profileId: "p_priya", name: "Priya Iyer" } },
);
eq(
  "a boost asked for out loud still asks first",
  planReply({ reply: "<<<DO:activateBoost>>>", roster: [], scope: null, hopUsed: false, sendTarget: null }).run,
  { kind: "confirm", key: "activateBoost", target: null },
);
{
  const reply = "<<<DO:shortlistProfile>>>\n<<<DO:sendInterestToProfile>>>";
  const p = planReply({ reply, roster: ROSTER, scope: PRIYA_SCOPE, hopUsed: false, sendTarget: null });
  eq("two spoken actions: only the first is planned", p.run?.kind, "execute");
  const chips = chipsFor({ id: "m", role: "assistant", kind: "turn", content: reply, ranRun: true }, p.segments);
  eq("…and after it ran, no chip is offered for what already ran (the web's rule)", chips, []);
  const before = chipsFor({ id: "m", role: "assistant", kind: "turn", content: reply }, p.segments);
  eq("…while it has not run, both stay tappable", before, ["shortlistProfile", "sendInterestToProfile"]);
}
{
  const p = planReply({ reply: "<<<WHO:2>>>\nTheek hai, Priya ko dekhte hain.", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("a name alone focuses on that person (the hop)", p.hop, { kind: "candidate", profileId: "p_priya", name: "Priya Iyer", source: "chat" });
  eq("…once per question", planReply({ reply: "<<<WHO:2>>>", roster: ROSTER, scope: null, hopUsed: true, sendTarget: null }).hop, null);
  eq("…and never onto the person already open", planReply({ reply: "<<<WHO:2>>>", roster: ROSTER, scope: PRIYA_SCOPE, hopUsed: false, sendTarget: null }).hop, null);
}
{
  const p = planReply({ reply: "<<<WHO:4>>>\n<<<SEND>>>Kal 7 baje call karein?<<<END>>>", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("a message to a matched roster person opens the editor for that thread", p.send, { text: "Kal 7 baje call karein?", target: { matchId: "m_riya", name: "Riya Shah" }, openEditor: true });
  eq("…and does not also hop", p.hop, null);
}
{
  const p = planReply({ reply: "<<<WHO:2>>>\n<<<SEND>>>Hi<<<END>>>", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("a message to someone with no open chat has no thread", p.send, { text: "Hi", target: null, openEditor: false });
}
{
  const p = planReply({ reply: "<<<WHO:4>>>\n<<<SEND>>>Pehla<<<END>>>\n<<<SEND>>>Doosra<<<END>>>", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("options to choose from stay cards — the editor does not pick one", [p.send?.target, p.send?.openEditor], [{ matchId: "m_riya", name: "Riya Shah" }, false]);
}
{
  const scope = { kind: "match" as const, matchId: "m_riya", name: "Riya Shah" };
  const p = planReply({ reply: "<<<WHO:4>>>\n<<<SEND>>>Kal baat karein?<<<END>>>", roster: ROSTER, scope, hopUsed: false, sendTarget: null });
  eq("inside that chat's own conversation a draft is a card to open", p.send?.openEditor, false);
  eq("…and the conversation stays on the match (no hop to their profile)", p.hop, null);
}
{
  const p = planReply({ reply: "<<<SEND>>>Namaste<<<END>>>", roster: [], scope: { kind: "match", matchId: "m_x", name: "X" }, hopUsed: false, sendTarget: null });
  eq("a draft in a match conversation goes to that match — shown, not auto-opened", p.send, { text: "Namaste", target: { matchId: "m_x", name: "X" }, openEditor: false });
}
{
  const p = planReply({ reply: "<<<FIND:Pune, CA, 25-29>>>\n<<<WHO:1>>>", roster: ROSTER, scope: null, hopUsed: false, sendTarget: null });
  eq("a search is taken up and does not hop", [p.find, p.hop], ["Pune, CA, 25-29", null]);
}
{
  const p = planReply({ reply: "<<<ACT:remember:Main Delhi me hoon>>><<<DO:remember:Veg hoon>>>", roster: [], scope: null, hopUsed: false, sendTarget: null });
  eq("remember facts are collected from both markers", p.remember, ["Main Delhi me hoon", "Veg hoon"]);
  eq("…and remember is never a chip", chipsFor({ id: "m", role: "assistant", kind: "turn", content: "" }, p.segments), []);
}
{
  const msg: GrioMessage = {
    id: "m",
    role: "assistant",
    kind: "turn",
    content: "",
    meta: {
      intent: "PROFILE_SUMMARY",
      profileId: "p_priya",
      evidence: null,
      profileActions: [{ id: "i", kind: "catalog", label: "Send interest", actionKey: "sendInterestToProfile" }],
      followUps: [],
      answeredBy: "ai",
    },
  };
  eq("a profile answer's catalog button joins the chips, once", chipsFor(msg, parseGrioSegments("<<<ACT:sendInterestToProfile>>>")), ["sendInterestToProfile"]);
}

/* ------------------------------------------------------------------ */
console.log("\n── the /api/concierge body ──");
{
  const turns = Array.from({ length: 15 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `t${i}` }));
  const b = buildConciergeBody({ transcript: turns, scope: null, scopeStart: 0, shownProfileIds: [], lastIntent: null });
  eq("at most 12 turns", b.messages.length, 12);
  eq("…the newest ones", b.messages[11]!.content, "t14");
  check("no scope ids without a scope", !("matchId" in b) && !("candidateProfileId" in b));
}
{
  const b = buildConciergeBody({
    transcript: [{ role: "user", content: "x".repeat(1500) }, { role: "assistant", content: "  " }, { role: "user", content: "aur?" }],
    scope: PRIYA_SCOPE,
    scopeStart: 0,
    shownProfileIds: ["a", "a", "b"],
    lastIntent: "PROFILE_SUMMARY",
  });
  eq("each turn clipped to the route's limit", b.messages[0]!.content.length, GRIO_MAX_MESSAGE_LENGTH);
  eq("empty turns dropped", b.messages.length, 2);
  eq("candidate scope carries only its own id", [b.candidateProfileId, "matchId" in b], ["p_priya", false]);
  eq("shown cards de-duplicated", b.shownProfileIds, ["a", "b"]);
  eq("the last intent rides with a profile question", b.lastIntent, "PROFILE_SUMMARY");
}
{
  const b = buildConciergeBody({
    transcript: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }, { role: "user", content: "c" }],
    scope: { kind: "match", matchId: "m_riya", name: "Riya" },
    scopeStart: 1,
    shownProfileIds: [],
    lastIntent: "PROFILE_SUMMARY",
  });
  eq("match scope carries only the match", [b.matchId, "candidateProfileId" in b, "lastIntent" in b], ["m_riya", false, false]);
  eq("…and its whole conversation (only a profile question is cut at scope start)", b.messages.length, 3);
}
{
  const b = buildConciergeBody({
    transcript: [{ role: "user", content: "old" }, { role: "assistant", content: "old reply" }, { role: "user", content: "family?" }],
    scope: PRIYA_SCOPE,
    scopeStart: 2,
    shownProfileIds: [],
    lastIntent: null,
  });
  eq("a profile question sends only the turns since that profile opened", b.messages.map((m) => m.content), ["family?"]);
}

/* ------------------------------------------------------------------ */
console.log("\n── responses the app accepts ──");
{
  const r = parseConciergeResponse({
    ok: true,
    reply: "Hi",
    roster: [{ n: 1, profileId: "p1", name: "A" }, { n: "x", profileId: "p2", name: "B" }, { n: 2, profileId: "", name: "C" }],
    evidence: { title: 1 },
    followUps: [{ id: "a", label: "L", ask: "Q", intent: "PROFILE_SUMMARY" }, { id: "b", label: "L", ask: "Q", intent: "NOT_AN_INTENT" }],
    profileActions: [{ id: "c", kind: "catalog", label: "X", actionKey: "deleteAccount" }, { id: "d", kind: "view_profile", label: "View" }],
  });
  eq("malformed roster rows are dropped one by one", r?.roster?.map((x) => x.profileId), ["p1"]);
  eq("a malformed evidence card is dropped, the reply survives", [r?.reply, r?.evidence], ["Hi", null]);
  eq("a follow-up with an unknown intent is dropped", r?.followUps.length, 1);
  eq("a profile button naming a key outside the catalog is dropped", r?.profileActions.map((a) => a.kind), ["view_profile"]);
}
eq("a body that is not a Grio answer is rejected", parseConciergeResponse({ reply: 5 }), null);

/* ------------------------------------------------------------------ */
console.log("\n── close command + LEARN catalog ──");
for (const [s, want] of [
  ["Grio band karo", true],
  ["band kar do please", true],
  ["bye", true],
  ["Grio, close.", true],
  ["band karo mat", false],
  ["interest band karo", false],
  ["chat band kyun hai?", false],
  ["Priya ko message likho", false],
] as const) {
  eq(`close command: "${s}"`, isCloseCommand(s), want);
}
check("a LEARN key the catalog has is askable", learnQuestion("childrenPreference") !== null);
check("a multi-select LEARN key is never a one-tap card", learnQuestion("dealBreakerCodes") === null);
check("an unknown LEARN key renders nothing", learnQuestion("salary") === null);
eq("an option a dash apart still matches", matchLearnOption(learnQuestion("marriageTimeline")!, "6-12 months"), "6–12 months");

/* ------------------------------------------------------------------ */
/* the engine, end to end, against a scripted server                  */
/* ------------------------------------------------------------------ */

function turn(partial: Partial<ConciergeTurnResult>): ConciergeTurnResult {
  return {
    ok: true,
    reply: null,
    code: null,
    message: null,
    roster: null,
    intent: null,
    profileId: null,
    header: null,
    evidence: null,
    profileActions: [],
    followUps: [],
    answeredBy: null,
    sendTarget: null,
    ...partial,
  };
}

interface Harness {
  engine: ReturnType<typeof createGrioEngine>;
  bodies: ConciergeRequestBody[];
  calls: Array<{ url: string; method: string; body?: unknown }>;
  sent: Array<{ matchId: string; text: string }>;
  asked: Array<{ profileId: string; text: string }>;
  navigated: string[];
  websites: string[];
  toasts: string[];
  refreshed: GrioDataEvent[];
  dismissed: number;
  learned: Array<{ key: string; value: string }>;
  remembered: string[];
  forgotten: string[];
  searches: unknown[];
}

function harness(script: (body: ConciergeRequestBody, n: number) => ConciergeTurnResult | Error, over: Partial<GrioTransport> = {}): Harness {
  const h = {
    bodies: [],
    calls: [],
    sent: [],
    asked: [],
    navigated: [],
    websites: [],
    toasts: [],
    refreshed: [],
    dismissed: 0,
    learned: [],
    remembered: [],
    forgotten: [],
    searches: [],
  } as unknown as Harness;
  const transport: GrioTransport = {
    async concierge(body) {
      h.bodies.push(body);
      const out = script(body, h.bodies.length);
      if (out instanceof Error) throw out;
      return out;
    },
    async briefing() {
      return { ok: true, text: "Aaj aapke 3 rishtey hain.", roster: ROSTER };
    },
    async walkthrough() {
      return [{ profileId: "p_ananya", name: "Ananya Mehta" }, { profileId: "p_priya", name: "Priya Iyer" }];
    },
    async people() {
      return [{ profileId: "p_neha", name: "Neha Verma", source: "shortlist" }];
    },
    async matches() {
      return [{ matchId: "m_riya", name: "Riya Shah", photoUrl: null }];
    },
    async cards() {
      return [];
    },
    async profileBrief(profileId) {
      return { ok: true, header: undefined, suggestions: [], signals: undefined, message: profileId };
    },
    async run(call) {
      h.calls.push({ url: call.url, method: call.method, body: call.body });
      return { ok: true, message: null, matched: false, matchId: null };
    },
    async sendMessage(matchId, text) {
      h.sent.push({ matchId, text });
      return { ok: true, message: null, matched: false, matchId };
    },
    async askQuestion(profileId, text) {
      h.asked.push({ profileId, text });
      return { ok: true, alreadyAsked: false, heldForReview: false, message: null };
    },
    async remember(fact) {
      h.remembered.push(fact);
      return { ok: true, itemId: `mem_${h.remembered.length}`, message: null };
    },
    async forget(itemId) {
      h.forgotten.push(itemId);
      return true;
    },
    async learn(key, value) {
      h.learned.push({ key, value });
      return { ok: true, message: null };
    },
    async discoverIntent(query) {
      return { ok: true, message: null, summary: `S(${query})`, filters: { cities: ["Pune"] }, unresolved: [], behaviorMode: null };
    },
    async discoverSearch(filters) {
      h.searches.push(filters);
      return { ok: true, message: null, profileIds: ["p_kavya", "p_x"], countLabel: "2 profiles" };
    },
    ...over,
  };
  const effects: GrioEffects = {
    navigate(route) {
      h.navigated.push(route);
      return true;
    },
    openWebsite(path) {
      h.websites.push(path);
    },
    toast(_tone, message) {
      h.toasts.push(message);
    },
    haptic() {},
    refresh(event) {
      h.refreshed.push(event);
    },
    dismiss() {
      h.dismissed++;
    },
  };
  h.engine = createGrioEngine(transport, effects);
  return h;
}

const state = (h: Harness) => h.engine.store.getState();
const lastMsg = (h: Harness) => state(h).messages[state(h).messages.length - 1]!;

async function engineChecks() {
  console.log("\n── engine: one turn engine for typed, chip and voice ──");

  // Same words, three ways in — the same result each time.
  const results: string[] = [];
  for (const source of ["typed", "chip", "voice"] as const) {
    const h = harness(() => turn({ reply: "<<<SHOW:1,2>>>\nYe rahe aaj ke rishtey.", roster: ROSTER }));
    await h.engine.ask("Aaj ke profiles dikhao", { source });
    const s = state(h);
    results.push(JSON.stringify({ cards: lastMsg(h).cards, shown: s.shown, pending: s.pending, bodies: h.bodies.length, calls: h.calls.length }));
  }
  check("typed, chip and voice reach the same cards, the same nothing-pending", results.every((r) => r === results[0]), results);

  {
    const h = harness(() => turn({ reply: "<<<DO:shortlistProfile>>>\nTheek hai." }));
    h.engine.open({ kind: "candidate", profileId: "p_priya", name: "Priya Iyer", source: "reel" });
    await h.engine.ask("Isko shortlist kar do");
    eq("a reel's Ask Grio scopes the request to that exact profile", h.bodies[0]?.candidateProfileId, "p_priya");
    eq("…'shortlist kar do' runs on it, through the catalog row's own endpoint", h.calls, [{ url: "/api/shortlist/p_priya", method: "PUT", body: undefined }]);
    const out = lastMsg(h);
    check("…the outcome is written into the transcript", out.kind === "outcome" && out.content.startsWith("✓ ") && out.tone === "success", out);
    eq("…and the saved lists refresh", h.refreshed, [{ kind: "shortlist", profileId: "p_priya", on: true }]);
    check("…with Undo", out.undo?.kind === "shortlist" && out.undo.done === false, out.undo);
    await h.engine.undo(out.id);
    eq("Undo takes it back through the shortlist's own DELETE", h.calls[1], { url: "/api/shortlist/p_priya", method: "DELETE", body: undefined });
    eq("…and says so", [lastMsg(h).kind, h.refreshed[1]], ["outcome", { kind: "shortlist", profileId: "p_priya", on: false }]);
    await h.engine.undo(out.id);
    eq("…once", h.calls.length, 2);
  }

  {
    const h = harness(() => turn({ reply: "<<<DO:shortlistProfile>>>\nKis ko?" }));
    await h.engine.ask("Shortlist kar do");
    eq("no one in view → the picker, and nothing is called", [state(h).pending?.kind, h.calls.length], ["pickPerson", 0]);
    await h.engine.pickPerson({ profileId: "p_neha", name: "Neha Verma", source: "shortlist" });
    eq("…the person a finger picked is the one it runs on", h.calls, [{ url: "/api/shortlist/p_neha", method: "PUT", body: undefined }]);
  }

  {
    const h = harness(() => turn({ reply: "<<<WHO:2>>>\n<<<DO:sendInterestToProfile>>>\nTheek hai.", roster: ROSTER }));
    await h.engine.ask("Priya ko interest bhej do");
    const p = state(h).pending;
    eq("an interest asked by name opens the confirm, naming the person", p?.kind === "confirm" ? [p.key, p.target] : p, [
      "sendInterestToProfile",
      { profileId: "p_priya", name: "Priya Iyer" },
    ]);
    eq("…nothing has left yet", h.calls.length, 0);
    await h.engine.confirmPending();
    eq("confirm sends it through /api/interests with code's id", h.calls, [{ url: "/api/interests", method: "POST", body: { profileId: "p_priya" } }]);
    const replyId = state(h).messages.find((m) => m.kind === "turn" && m.role === "assistant")!.id;
    check("…its chip is marked done", state(h).completed[chipId(replyId, "sendInterestToProfile")] === true);
    await h.engine.tapChip(replyId, "sendInterestToProfile");
    eq("…and a second tap does nothing", [h.calls.length, state(h).pending], [1, null]);
    eq("…the interest refreshes interests, the reel card and counts", h.refreshed, [{ kind: "interest", profileId: "p_priya", matched: false, matchId: null }]);
  }

  {
    const h = harness(() => turn({ reply: "<<<DO:sendInterestToProfile:p_evil>>>\n<<<ACT:openReel:https://evil.example>>>" }));
    await h.engine.ask("interest bhej do");
    eq("a forged id never reaches an endpoint — the picker asks", [state(h).pending?.kind, h.calls.length], ["pickPerson", 0]);
    h.engine.cancelPending();
    const replyId = lastMsg(h).id;
    await h.engine.tapChip(replyId, "openReel");
    eq("a chip with a URL argument opens the catalog's screen, never the URL", [h.navigated, h.websites], [["/reels"], []]);
  }

  {
    const h = harness(() => turn({ reply: "Kuch options:\n<<<SEND>>>Namaste Riya ji!<<<END>>>" }));
    h.engine.open({ kind: "match", matchId: "m_riya", name: "Riya Shah" });
    await h.engine.ask("Icebreaker do");
    eq("a chat's Ask Grio scopes the request to that match", [h.bodies[0]?.matchId, h.bodies[0]?.candidateProfileId], ["m_riya", undefined]);
    eq("…the draft is a card, not a send", [lastMsg(h).sendTarget, state(h).pending, h.sent.length], [{ matchId: "m_riya", name: "Riya Shah" }, null, 0]);
    h.engine.openDraft(lastMsg(h).id, "send", "Namaste Riya ji!");
    eq("Send opens the editor for that match", state(h).pending?.kind, "draft");
    await h.engine.confirmPending("Namaste Riya ji, kaisi hain?");
    eq("…and what leaves is the member's edited text", h.sent, [{ matchId: "m_riya", text: "Namaste Riya ji, kaisi hain?" }]);
    eq("…the thread refreshes", h.refreshed, [{ kind: "message", matchId: "m_riya" }]);
  }

  {
    const h = harness(() => turn({ reply: "<<<WHO:4>>>\n<<<SEND>>>Kal baat karein?<<<END>>>", roster: ROSTER }));
    await h.engine.ask("Riya ko message likho");
    const p = state(h).pending;
    eq("'X ko message likho' opens the editable draft for X's thread", p?.kind === "draft" ? [p.draft, p.text] : p, [
      { kind: "send", target: { matchId: "m_riya", name: "Riya Shah" } },
      "Kal baat karein?",
    ]);
    eq("…and nothing is sent until Send", h.sent.length, 0);
    h.engine.cancelPending();
    eq("cancel sends nothing", h.sent.length, 0);
  }

  {
    const h = harness(() => turn({ reply: "<<<SEND>>>Hello<<<END>>>" }));
    await h.engine.ask("Kisi ko message likhne me madad karo");
    h.engine.openDraft(lastMsg(h).id, "send", "Hello");
    eq("a draft with no thread asks which match", state(h).pending?.kind, "pickMatch");
    h.engine.pickMatch({ matchId: "m_riya", name: "Riya Shah", photoUrl: null });
    eq("…the picked match becomes the conversation's scope and the editor opens", [state(h).scope, state(h).pending?.kind], [
      { kind: "match", matchId: "m_riya", name: "Riya Shah" },
      "draft",
    ]);
  }

  {
    const h = harness(() => turn({ reply: "Ye sawaal:\n<<<ASK>>>Weekend par kya pasand hai?<<<END>>>" }));
    h.engine.open({ kind: "candidate", profileId: "p_priya", name: "Priya Iyer", source: "page" });
    await h.engine.ask("Inse ek sawaal poochhna hai");
    h.engine.openDraft(lastMsg(h).id, "ask", "Weekend par kya pasand hai?");
    await h.engine.confirmPending();
    eq("an Ask Bridge question goes to the profile it was drafted for", h.asked, [{ profileId: "p_priya", text: "Weekend par kya pasand hai?" }]);
  }

  {
    const h = harness(() => turn({ reply: "<<<DO:shortlistProfile>>>" }), {
      async run(call) {
        return { ok: false, message: `Ye profile aapki nahi hai (${call.url})`, matched: false, matchId: null };
      },
    });
    h.engine.open({ kind: "candidate", profileId: "p_someone_else", name: "X", source: "page" });
    await h.engine.ask("shortlist kar do");
    const out = lastMsg(h);
    check("a server refusal (cross-user, quota) is shown in the server's words", out.tone === "error" && out.content.includes("aapki nahi hai"), out);
    eq("…and nothing is refreshed as if it worked", h.refreshed, []);
  }

  {
    const h = harness(() => new GrioOfflineError());
    await h.engine.ask("Kya haal hai?");
    const s = state(h);
    eq("offline: the question stays, the turn says so, the composer frees", [s.messages.length, s.error?.code, s.sending], [1, "network", false]);
  }

  {
    const h = harness(() => turn({ ok: false, code: "quota_exceeded", message: "Aaj ke 10 Grio sawaal ho gaye — kal phir baat karte hain." }));
    await h.engine.ask("Aur batao");
    eq("a spent daily allowance is said plainly", state(h).error, { message: "Aaj ke 10 Grio sawaal ho gaye — kal phir baat karte hain.", code: "quota_exceeded" });
  }

  {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const h = harness(() => turn({ reply: "ok" }), {});
    const slow = h.engine.transport.concierge;
    h.engine.transport.concierge = async (b) => {
      await gate;
      return slow(b);
    };
    const one = h.engine.ask("pehla");
    const two = h.engine.ask("doosra");
    release();
    await Promise.all([one, two]);
    eq("one turn at a time — a second ask while busy is dropped", h.bodies.length, 1);
  }

  {
    const h = harness((b, n) =>
      n === 1 ? turn({ reply: "<<<WHO:2>>>\nTheek hai, Priya ko dekhte hain.", roster: ROSTER }) : turn({ reply: "Priya Bengaluru me Software Engineer hain.", intent: "PROFILE_SUMMARY", profileId: b.candidateProfileId ?? null }),
    );
    await h.engine.ask("Priya ke baare me batao");
    eq("the focus hop re-asks once, scoped to that roster person", [h.bodies.length, h.bodies[1]?.candidateProfileId], [2, "p_priya"]);
    eq("…with the same words as the trailing turn", h.bodies[1]?.messages.at(-1), { role: "user", content: "Priya ke baare me batao" });
    eq("…shown once on screen", state(h).messages.filter((m) => m.role === "user").length, 1);
    eq("…and the budget resets for the next question", state(h).hopUsed, false);
  }

  {
    const h = harness(() => turn({ reply: "x" }));
    await h.engine.ask("Grio band karo");
    eq("'Grio band karo' closes the room without a model call", [h.dismissed, h.bodies.length], [1, 0]);
  }

  {
    const h = harness(() => turn({ reply: "<<<FIND:Pune me CA, 25 se 29>>>\nDekhta hoon." }));
    await h.engine.ask("Pune me CA, age 25 se 29 profiles dikhao");
    const out = lastMsg(h);
    eq("a search runs through Discovery and its line is code's", [out.kind, out.content, out.cards], ["outcome", "🔎 S(Pune me CA, 25 se 29) — 2 profiles mile.", ["p_kavya", "p_x"]]);
    eq("…those cards are what the next turn calls 'shown'", state(h).shown, ["p_kavya", "p_x"]);
  }

  {
    const h = harness(() => turn({ reply: "<<<LEARN:childrenPreference=Definitely yes>>>\nSamajh gaya." }));
    await h.engine.ask("Haan bachche to chahiye");
    const replyId = lastMsg(h).id;
    eq("LEARN writes nothing by itself", h.learned.length, 0);
    await h.engine.saveLearn(replyId, "childrenPreference", "Definitely yes");
    eq("…the confirmed answer goes to /api/profile/intelligence", h.learned, [{ key: "childrenPreference", value: "Definitely yes" }]);
    eq("…and the member's own profile refreshes", h.refreshed, [{ kind: "self" }]);
  }

  {
    const h = harness(() => turn({ reply: "<<<ACT:remember:Main Delhi me rehta hoon>>>\nYaad rakh liya." }));
    await h.engine.ask("Main Delhi me rehta hoon, yaad rakhna");
    await new Promise((r) => setTimeout(r, 0));
    const reply = state(h).messages.find((m) => m.role === "assistant")!;
    eq("remember is saved and shown under the reply", [h.remembered, reply.remembered?.[0]?.fact], [["Main Delhi me rehta hoon"], "Main Delhi me rehta hoon"]);
    await h.engine.forget(reply.id, 0);
    eq("…and Undo forgets that row", h.forgotten, ["mem_1"]);
  }

  {
    const h = harness((b) => turn({ reply: `Step for ${b.candidateProfileId}` }));
    await h.engine.startWalkthrough();
    await new Promise((r) => setTimeout(r, 0));
    eq("walk through today asks about the first rishta, scoped to it", h.bodies[0]?.candidateProfileId, "p_ananya");
    h.engine.nextStep();
    await new Promise((r) => setTimeout(r, 0));
    eq("…Next moves the scope to the next one", h.bodies[1]?.candidateProfileId, "p_priya");
  }

  {
    const h = harness(() =>
      turn({ reply: "Priya ki poori profile khol sakte hain — neeche se.", intent: "NAVIGATION", profileId: "p_priya", answeredBy: "code", profileActions: [{ id: "v", kind: "view_profile", label: "View profile" }] }),
    );
    h.engine.open({ kind: "candidate", profileId: "p_priya", name: "Priya Iyer", source: "reel" });
    await h.engine.ask("Full profile kholo");
    eq("'Full profile kholo' opens the profile in scope", h.navigated, ["/profile/p_priya"]);
  }

  {
    const h = harness(() => turn({ reply: "x" }));
    h.engine.open({ kind: "discovery", summary: "Pune · CA", filters: { cities: ["Pune"], professionCategory: ["CA"] } });
    await h.engine.showDiscoveryResults();
    eq("Search's context runs with the member's exact filters", h.searches, [{ cities: ["Pune"], professionCategory: ["CA"] }]);
  }

  {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const h = harness(() => turn({ reply: "<<<SHOW:1>>>", roster: ROSTER }));
    const slow = h.engine.transport.concierge;
    h.engine.transport.concierge = async (b) => {
      await gate;
      return slow(b);
    };
    const pending = h.engine.ask("kuch");
    h.engine.reset();
    release();
    await pending;
    eq("a reply that lands after a reset (sign-out) is dropped", [state(h).messages.length, state(h).roster.length], [0, 0]);
  }

  {
    const h = harness(() => turn({ reply: "ok" }));
    h.engine.open({ kind: "dashboard" });
    await new Promise((r) => setTimeout(r, 0));
    eq("the dashboard opens on the day's briefing, with its roster", [state(h).messages[0]?.kind, state(h).roster.length], ["briefing", 4]);
    h.engine.open({ kind: "candidate", profileId: "p_neha", name: "Neha Verma", source: "reel" });
    eq("opening on a person marks where that conversation starts", Object.values(state(h).dividers), ["Ab baat: Neha Verma ki profile"]);
  }
}

void engineChecks().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
});
