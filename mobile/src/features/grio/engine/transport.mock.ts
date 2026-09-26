import { db, delay, makeMatch } from "~/mocks/mockDb";
import { mockPerson } from "~/mocks/people";
import { searchService } from "~/services/search";
import { firstNameOf } from "~/utils/names";
import type { ConciergeRosterEntry } from "~/shared/grio/concierge";
import type { GrioProfileCard } from "~/shared/grio/grioCards";
import type { GrioEvidenceCard, GrioProfileHeader, GrioPromptSuggestion } from "~/shared/grio/grioProfile";
import type { ConciergeTurnResult, GrioTransport } from "./types";

/**
 * Grio for `EXPO_PUBLIC_DATA_MODE=mock` — the offline demo, not the product's
 * brain. It answers with the *server's* marker grammar (`<<<SHOW:>>>`,
 * `<<<WHO:n>>><<<DO:…>>>`, `<<<SEND>>>`, `<<<FIND:>>>`, `<<<LEARN:>>>` …) from a
 * few plain patterns over the sample people, so every path of the real engine —
 * cards, confirms, the picker, drafts, a search — can be walked without a
 * server. Every action still mutates the same in-memory backend the rest of
 * the mock app reads.
 */

const MEMORY: Array<{ id: string; body: string }> = [];

function roster(): ConciergeRosterEntry[] {
  const entries: ConciergeRosterEntry[] = [];
  const add = (profileId: string, name: string, matchId: string | null) => {
    if (entries.some((e) => e.profileId === profileId)) return;
    entries.push({ n: entries.length + 1, profileId, name, matchId });
  };
  db.cards.filter((c) => !c.lastDecision && !c.matchId).slice(0, 6).forEach((c) => add(c.id, c.displayName, null));
  db.received.filter((i) => i.status === "RECEIVED" && i.profileId).forEach((i) => add(i.profileId!, i.fromUser.displayName, null));
  db.cards.filter((c) => c.shortlisted).forEach((c) => add(c.id, c.displayName, c.matchId));
  db.matches.forEach((m) => add(m.profileId, m.displayName, m.id));
  return entries;
}

function base(): ConciergeTurnResult {
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
  };
}

function headerFor(profileId: string): GrioProfileHeader | null {
  const c = db.cards.find((x) => x.id === profileId);
  if (!c) return null;
  return {
    profileId,
    name: c.displayName,
    age: c.age,
    city: c.city,
    headline: [c.education, c.profession].filter(Boolean).join(" · ") || null,
    photoUrl: c.photoUnlocked ? c.photoUrl : null,
    photoLock: c.photoUnlocked ? "open" : c.photoLock,
    verified: c.verified,
    level: c.matchId ? "L3" : c.interestSent ? "L2" : "L1",
    levelLabel: c.matchId ? "Match" : c.interestSent ? "Interest ke baad" : "Shuruaati jaankari",
    matchId: c.matchId,
    chatOpen: Boolean(c.matchId),
  };
}

const PROFILE_CHIPS: GrioPromptSuggestion[] = [
  { id: "summary", label: "Short summary", ask: "Is profile ka short summary do", intent: "PROFILE_SUMMARY" },
  { id: "common", label: "What's common?", ask: "Hum dono me common kya hai?", intent: "PROFILE_COMPARE" },
  { id: "work", label: "Education & work", ask: "Inki education aur work samjhao", intent: "PROFILE_SUMMARY" },
  { id: "missing", label: "What's missing?", ask: "Kya information abhi missing hai?", intent: "PROFILE_MISSING_INFO" },
];

function evidenceFor(profileId: string): GrioEvidenceCard {
  const p = mockPerson(profileId);
  const mine = db.values;
  return {
    title: "Kya compare hua",
    groups: [
      {
        status: "match",
        label: "Milta hai",
        rows: [
          { key: "common:diet", area: "lifestyle", label: "Diet", kind: "common", status: mine.diet === p?.diet ? "match" : "different", yours: mine.diet ?? null, theirs: p?.diet ?? null, note: null },
          { key: "common:familyType", area: "family", label: "Family type", kind: "common", status: mine.familyType === p?.familyType ? "match" : "different", yours: mine.familyType ?? null, theirs: p?.familyType ?? null, note: null },
        ],
      },
      {
        status: "unknown",
        label: "Abhi pata nahi",
        rows: [{ key: "values:postMarriageLivingPlan", area: "values", label: "Shaadi ke baad kahan rehna", kind: "values", status: "unknown", yours: null, theirs: null, note: "Ye poochhne layak baat hai." }],
      },
    ],
    footnote: "Sample data — offline demo.",
  };
}

function scopedReply(profileId: string, q: string): ConciergeTurnResult {
  const c = db.cards.find((x) => x.id === profileId);
  const p = mockPerson(profileId);
  const name = firstNameOf(c?.displayName ?? "Ye profile");
  const out = { ...base(), profileId, header: headerFor(profileId), answeredBy: "code" as const };
  if (/shortlist|save kar/.test(q)) return { ...base(), reply: "<<<DO:shortlistProfile>>>\nTheek hai, shortlist me rakh raha hoon — unhe iski koi khabar nahi jayegi." };
  if (/interest (bhej|send)/.test(q) && !/kya|\?/.test(q)) {
    return { ...base(), reply: "<<<DO:sendInterestToProfile>>>\nTheek hai — bhejne se pehle ek baar confirm kar lijiye." };
  }
  if (/(full|poori) profile|profile (kholo|khol do|open|dikhao)/.test(q)) {
    return { ...out, reply: `${name} ki poori profile khol sakte hain — neeche se.`, intent: "NAVIGATION", profileActions: [{ id: "view", kind: "view_profile", label: "View profile" }] };
  }
  if (/common|milta|same/.test(q)) {
    return { ...out, reply: `Aap dono me kuch baatein milti hain — neeche dekhiye kya compare hua.`, intent: "PROFILE_COMPARE", evidence: evidenceFor(profileId), followUps: PROFILE_CHIPS.slice(2) };
  }
  if (/sawaal|question|poochh/.test(q)) {
    return { ...base(), reply: `Ye seedha aur respectful sawaal ban jaata hai — bhejne se pehle badal sakte hain.\n<<<ASK>>>Aapko weekend par kya karna sabse zyada pasand hai?<<<END>>>` };
  }
  if (/missing|pata nahi|kya nahi/.test(q)) {
    return { ...out, reply: `${name} ki family aur shaadi ke baad ki planning ke baare me abhi profile par kuch nahi likha hai.`, intent: "PROFILE_MISSING_INFO", followUps: PROFILE_CHIPS.slice(0, 2) };
  }
  const lines = [
    c ? `${c.displayName}, ${c.age ?? ""} — ${c.city ?? ""}` : name,
    c?.education || c?.profession ? `Padhai/kaam: ${[c?.education, c?.profession].filter(Boolean).join(", ")}` : null,
    p ? `Family: ${p.familyType} · Diet: ${p.diet}` : null,
  ].filter(Boolean);
  return {
    ...out,
    reply: `Seedhi bhasha me:\n${lines.map((l) => `• ${l}`).join("\n")}\nFaisla aapka hi rahega.`,
    intent: "PROFILE_SUMMARY",
    followUps: PROFILE_CHIPS.slice(1),
    profileActions: [
      { id: "about", kind: "open_section", label: "See details", section: "about" },
      { id: "interest", kind: "catalog", label: "Send interest", actionKey: "sendInterestToProfile" },
    ],
  };
}

function matchReply(matchId: string, q: string): ConciergeTurnResult {
  const m = db.matches.find((x) => x.id === matchId);
  const name = firstNameOf(m?.displayName ?? "unhe");
  if (/icebreaker|options/.test(q)) {
    return {
      ...base(),
      reply: `Kuch options:\n<<<SEND>>>Namaste ${name} ji! Aapka weekend kaisa raha?<<<END>>>\n<<<SEND>>>${name} ji, aapki profile me music dekha — aajkal kya sun rahe hain?<<<END>>>`,
    };
  }
  return { ...base(), reply: `Ye line ${name} ke liye theek rahegi — bhejne se pehle badal sakte hain.\n<<<SEND>>>Namaste ${name} ji 🙏 Aapki baat achhi lagi — kal shaam baat karein?<<<END>>>` };
}

/** The roster person whose name the question says — by any part of it ("Dr. Riya Kapoor" answers to "Riya"). */
function namedIn(q: string, list: ConciergeRosterEntry[]): ConciergeRosterEntry | undefined {
  const words = new Set(q.split(/[^\p{L}]+/u).filter(Boolean));
  return list.find((e) =>
    e.name
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .some((part) => part.length >= 3 && part !== "dr" && words.has(part)),
  );
}

function generalReply(q: string): ConciergeTurnResult {
  const list = roster();
  const named = namedIn(q, list);
  const out = { ...base(), roster: list };

  if (/band karo|close/.test(q)) return { ...out, reply: "Theek hai." };
  if (/poll|vibe|aaj ka sawaal/.test(q)) return { ...out, reply: "<<<ACT:answerTodayPoll>>>\nAaj ka Vibe sawaal abhi baaki hai." };
  if (named && /message|msg|likho|bolo/.test(q)) {
    if (named.matchId) {
      return { ...out, reply: `<<<WHO:${named.n}>>>\n<<<SEND>>>Namaste ${firstNameOf(named.name)} ji, kaise hain aap?<<<END>>>\nYe message ${firstNameOf(named.name)} ko bhejne ke liye taiyaar hai.` };
    }
    return { ...out, reply: `${firstNameOf(named.name)} se abhi chat khuli nahi hai — pehle interest ya ek sawaal bhej sakte hain.` };
  }
  if (/shortlist|save kar/.test(q)) {
    return named
      ? { ...out, reply: `<<<WHO:${named.n}>>>\n<<<DO:shortlistProfile>>>\nTheek hai, ${firstNameOf(named.name)} ko shortlist kar raha hoon.` }
      : { ...out, reply: "<<<DO:shortlistProfile>>>\nZaroor — kis ko shortlist karna hai, ye chun lijiye." };
  }
  if (/interest/.test(q) && /bhej|send/.test(q)) {
    return named
      ? { ...out, reply: `<<<WHO:${named.n}>>>\n<<<DO:sendInterestToProfile>>>\nTheek hai, ${firstNameOf(named.name)} ko interest bhej raha hoon — is mahine ke quota me se ek kharch hoga.` }
      : { ...out, reply: "<<<ACT:sendInterestToProfile>>>\nZaroor — kis par bhejna hai, ye chun lijiye." };
  }
  if (named) return { ...out, reply: `<<<WHO:${named.n}>>>\nTheek hai, ${firstNameOf(named.name)} ko dekhte hain.` };
  if (/\d{2}\s*(se|-|to)\s*\d{2}|ca\b|doctor|engineer/.test(q) && /dikhao|chahiye|dhoondh|search/.test(q)) {
    return { ...out, reply: `<<<FIND:${q.slice(0, 120)}>>>\nDekhta hoon kaun hai.` };
  }
  if (/aaj|today|profiles dikhao|rishtey dikhao/.test(q)) {
    const ns = list.slice(0, 3).map((e) => e.n).join(",");
    return { ...out, reply: ns ? `<<<SHOW:${ns}>>>\nYe rahe aaj ke rishtey.` : "Aaj ke saare rishtey dekh liye — kal naye aayenge." };
  }
  if (/unread|message/.test(q)) {
    const unread = Object.values(db.threads).flat().filter((m) => m.senderId !== "u_me" && !m.readAt).length;
    return { ...out, reply: unread > 0 ? `<<<ACT:openMatches>>>\nAapke ${unread} message bina padhe hain.` : "Abhi koi message bina padha nahi hai." };
  }
  if (/incomplete|adhoori|profile me kya|sudhaar|improve/.test(q)) {
    return { ...out, reply: "<<<ACT:openProfileSetup>>>\nPartner preference aur family details bhar dene se sahi rishtey jaldi milenge." };
  }
  if (/bachche|children/.test(q)) {
    return { ...out, reply: "<<<LEARN:childrenPreference=Definitely yes>>>\nSamajh gaya — kya ise profile me save kar dun?" };
  }
  if (/yaad rakh|remember/.test(q)) {
    const fact = q.replace(/.*(yaad rakh\w*|remember)\s*(ki|that)?/, "").trim().slice(0, 100) || "Family ke saath rehna pasand hai";
    return { ...out, reply: `<<<ACT:remember:${fact}>>>\nYaad rakh liya.` };
  }
  if (/pending|intezaar/.test(q)) {
    const waiting = db.received.filter((i) => i.status === "RECEIVED").length;
    return { ...out, reply: `<<<ACT:openInterests>>>\n${waiting} interest aapka jawab dekh rahe hain.` };
  }
  return { ...out, reply: "<<<ACT:openReel>>>\nMain profile, pehli baat-cheet aur app ke features me madad kar sakta hoon. Kisi insaan ke baare me faisla aapka hi rahega." };
}

function card(profileId: string): GrioProfileCard | null {
  const c = db.cards.find((x) => x.id === profileId);
  if (!c) return null;
  return {
    profileId,
    name: c.displayName,
    age: c.age,
    city: c.city,
    profession: c.profession,
    verified: c.verified,
    photoUrl: c.photoUnlocked ? c.photoUrl : null,
    photoLock: c.photoUnlocked ? "open" : c.photoLock,
    shortlisted: c.shortlisted,
    interestSent: c.interestSent,
    matchId: c.matchId,
    chatOpen: Boolean(c.matchId),
  };
}

export const mockGrioTransport: GrioTransport = {
  async concierge(body) {
    await delay(700);
    const last = [...body.messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() ?? "";
    if (body.candidateProfileId) return scopedReply(body.candidateProfileId, last);
    if (body.matchId) return matchReply(body.matchId, last);
    return generalReply(last);
  },
  async briefing() {
    await delay(300);
    const list = roster();
    const today = db.cards.filter((c) => !c.lastDecision && !c.matchId);
    const waiting = db.received.filter((i) => i.status === "RECEIVED").length;
    const names = today.slice(0, 3).map((c) => firstNameOf(c.displayName)).join(", ");
    const text = [
      today.length ? `Aaj aapke liye ${today.length} rishtey hain${names ? ` — ${names} aur baaki` : ""}.` : "Aaj ke saare rishtey dekh liye.",
      waiting ? `${waiting} interest aapka jawab dekh rahe hain.` : null,
      "Kisi ke baare me poochhiye, ya kahiye — main dikha deta hoon.",
    ]
      .filter(Boolean)
      .join(" ");
    return { ok: true, text, roster: list };
  },
  async walkthrough() {
    await delay(300);
    return db.cards.filter((c) => !c.lastDecision && !c.matchId).map((c) => ({ profileId: c.id, name: c.displayName }));
  },
  async people() {
    await delay(250);
    const received = db.received.filter((i) => i.status === "RECEIVED" && i.profileId).map((i) => ({ profileId: i.profileId!, name: i.fromUser.displayName, source: "interest_received" as const }));
    const saved = db.cards.filter((c) => c.shortlisted && !received.some((r) => r.profileId === c.id)).map((c) => ({ profileId: c.id, name: c.displayName, source: "shortlist" as const }));
    return [...received, ...saved];
  },
  async matches() {
    await delay(250);
    return db.matches.map((m) => ({ matchId: m.id, name: m.displayName, photoUrl: m.photoUrl }));
  },
  async cards(profileIds) {
    await delay(300);
    return profileIds.map(card).filter((c): c is GrioProfileCard => c !== null);
  },
  async profileBrief(profileId) {
    await delay(250);
    const header = headerFor(profileId);
    return header ? { ok: true, header, suggestions: PROFILE_CHIPS } : { ok: false, message: "Ye profile abhi available nahi hai." };
  },
  async run(call) {
    await delay(350);
    const shortlist = /^\/api\/shortlist\/([^/]+)$/.exec(call.url);
    if (shortlist) {
      const c = db.cards.find((x) => x.id === decodeURIComponent(shortlist[1]!));
      if (!c) return { ok: false, message: "Profile nahi mila.", matched: false, matchId: null };
      c.shortlisted = call.method === "PUT";
      return { ok: true, message: null, matched: false, matchId: null };
    }
    if (call.url === "/api/interests") {
      const profileId = String(call.body?.profileId ?? "");
      const c = db.cards.find((x) => x.id === profileId);
      if (!c) return { ok: false, message: "Profile nahi mila.", matched: false, matchId: null };
      if (c.interestSent) return { ok: false, message: "Interest pehle hi bheja ja chuka hai.", matched: false, matchId: null };
      c.interestSent = true;
      const received = db.received.find((i) => i.profileId === profileId && i.status === "RECEIVED");
      if (received) {
        received.status = "ACCEPTED";
        return { ok: true, message: null, matched: true, matchId: makeMatch(profileId) };
      }
      db.sent.unshift({
        id: `i_${profileId}_${Date.now()}`,
        fromUser: { displayName: "Aap" },
        toUser: { displayName: c.displayName, age: c.age ?? undefined, city: c.city ?? undefined },
        status: "SENT",
        sentDate: new Date().toISOString().slice(0, 10),
        profileId,
        canWithdraw: true,
      });
      return { ok: true, message: null, matched: false, matchId: null };
    }
    return { ok: true, message: null, matched: false, matchId: null };
  },
  async sendMessage(matchId, text) {
    await delay(300);
    const thread = (db.threads[matchId] ??= []);
    thread.push({ id: `msg_${Date.now()}`, senderId: "u_me", body: text, createdAt: new Date().toISOString(), readAt: null });
    return { ok: true, message: null, matched: false, matchId };
  },
  async askQuestion(profileId) {
    await delay(300);
    const c = db.cards.find((x) => x.id === profileId);
    if (!c) return { ok: false, alreadyAsked: false, heldForReview: false, message: "Profile nahi mila." };
    if (c.askedStatus !== "NONE") return { ok: true, alreadyAsked: true, heldForReview: false, message: null };
    c.askedStatus = "PENDING";
    return { ok: true, alreadyAsked: false, heldForReview: false, message: null };
  },
  async remember(fact) {
    await delay(200);
    const item = { id: `mem_${Date.now()}`, body: fact };
    MEMORY.push(item);
    return { ok: true, itemId: item.id, message: null };
  },
  async forget(itemId) {
    await delay(150);
    const i = MEMORY.findIndex((m) => m.id === itemId);
    if (i >= 0) MEMORY.splice(i, 1);
    return true;
  },
  async learn() {
    await delay(250);
    return { ok: true, message: null };
  },
  async discoverIntent(query) {
    try {
      const res = await searchService.intent(query, {});
      return { ok: true, message: null, summary: res.summary, filters: res.filters, unresolved: res.unresolvedRequests, behaviorMode: null };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : null, summary: "", filters: {}, unresolved: [], behaviorMode: null };
    }
  },
  async discoverSearch(filters) {
    const res = await searchService.search({ filters, mode: "flexible" });
    return { ok: true, message: null, profileIds: res.results.slice(0, 6).map((r) => r.profileId), countLabel: res.countLabel };
  },
};
