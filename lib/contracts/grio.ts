/**
 * Grio Action Layer (Phase G) — see `docs/bandhantak/11_ai_action_layer_and_growth_plan.md`.
 *
 * This is the generalisation of `<<<SEND>>>`. That marker already established
 * the only shape this app allows for an AI-initiated side effect: the model
 * *proposes*, the UI renders a control, the user taps, and code executes with
 * its own authorization. Nothing here changes that — it only widens the set of
 * things that can be proposed from "one message to one match" to a fixed,
 * code-owned list.
 *
 * Three properties are load-bearing (§7.1–7.2 of the doc):
 *
 *  1. **The catalog is the boundary, not the prompt.** A tool Grio must not
 *     have is absent from `GRIO_ACTIONS`, not forbidden in prose. An unknown
 *     key parses to nothing and renders nothing, so a hallucinated or
 *     prompt-injected action key is inert by construction rather than by the
 *     model's cooperation.
 *  2. **Labels come from here, never from the model.** The marker carries a
 *     key; the button's wording is looked up in this file. Otherwise the model
 *     would be writing the call-to-action a user taps, which is exactly the
 *     fake-urgency surface D-61 closes.
 *  3. **`kind` is the confirm gate.** `nav` is side-effect-free (it is a link
 *     the user could already reach from the bottom nav). `do` and `remember`
 *     write something, so they route through a confirm step in the client the
 *     same way `<<<SEND>>>` routes through `GrioSendConfirm`.
 */

import { SEND_MARKER_START, SEND_MARKER_END } from "./concierge";

/**
 * `<<<ACT:key>>>` or `<<<ACT:key:free text arg>>>`.
 *
 * Deliberately not JSON: the only argument any action takes today is one span
 * of human text (`remember`), and a JSON payload inside a marker inside a
 * model's output is three levels of escaping for a feature that needs none.
 * If a future action needs structured arguments it gets its own marker rather
 * than making this one lossy.
 */
export const ACT_MARKER_START = "<<<ACT:";
export const ACT_MARKER_END = ">>>";

export type GrioActionKind = "nav" | "do" | "remember";

export interface GrioActionSpec {
  /** Button wording. Code's, never the model's — see property 2 above. */
  label: string;
  kind: GrioActionKind;
  /**
   * When this action applies, in the model's language. Prompt-side only —
   * never rendered. Required (not optional) so that adding an action to the
   * catalog forces its author to say when it is appropriate; an action the
   * model has no idea when to offer is worse than one that doesn't exist,
   * because it will get offered at random.
   */
  when: string;
  /** `nav` only — an in-app route the user already has another way to reach. */
  href?: string;
  /** `do` only — the same endpoint this action's normal UI path posts to. */
  endpoint?: string;
  /** `do` only — what the confirm sheet asks before anything happens. */
  confirm?: string;
  /** `do` only — success toast. */
  done?: string;
}

/**
 * Every action Grio can propose. Adding a row here is the *entire* act of
 * granting a capability, which is why each `do` row points at an endpoint that
 * already enforces its own plan gate and ownership check — the button is a
 * shortcut to an existing door, never a new door.
 *
 * Nothing that ranks, unlocks, pays, or deletes appears here, and nothing that
 * touches another user's data does either. `sendMessage` is absent on purpose:
 * it already has a richer flow of its own (`<<<SEND>>>` → picker → confirm)
 * because the text has to stay editable up to the last moment.
 */
export const GRIO_ACTIONS = {
  // ── nav ──────────────────────────────────────────────────────────────────
  openProfileSetup: {
    label: "Complete profile",
    kind: "nav",
    href: "/user/profile-setup",
    when: "profile adhoori hai, ya user profile bharne/sudharne ki baat kar raha hai",
  },
  openReel: {
    label: "Today's matches",
    kind: "nav",
    href: "/user/reel",
    when: "aaj ke rishtey abhi baaki hain, ya user naye rishtey dekhna chahta hai",
  },
  openInbox: {
    label: "Open inbox",
    kind: "nav",
    href: "/user/inbox",
    when: "unread notice hain, ya aaye hue sawaal ka jawab dena hai",
  },
  openMatches: {
    label: "My matches",
    kind: "nav",
    href: "/user/matches",
    when: "user apne matches ya chal rahi baat-cheet ki baat kar raha hai",
  },
  openShortlist: {
    label: "My shortlist",
    kind: "nav",
    href: "/user/shortlist",
    when: "user ne jo log save kiye hain unki baat ho rahi hai",
  },
  openDeepProfile: {
    label: "Deep Profile",
    kind: "nav",
    href: "/user/deep-profile",
    when: "compatibility ya 13 dimensions ki baat ho rahi hai aur analysis pehle se ho chuki hai",
  },
  openVibe: {
    label: "Vibe Hub",
    kind: "nav",
    href: "/user/vibe",
    when: "roz ka sawaal, poll, streak ya badge ki baat ho rahi hai",
  },
  openBiodata: {
    label: "Biodata for family",
    kind: "nav",
    href: "/user/biodata",
    when: "parents/family ko dikhane wale biodata ya rishta card ki baat ho rahi hai",
  },
  openCircle: {
    label: "Serious Circle",
    kind: "nav",
    href: "/user/circle",
    when: "live event, Serious Circle ya seedhe seriously-dekh-rahe logon ki baat ho rahi hai",
  },
  openSubscription: {
    label: "Plans & billing",
    kind: "nav",
    href: "/user/subscription",
    when: "plan, limit khatam hone, ya upgrade ki baat ho rahi hai",
  },
  openBoost: {
    label: "Profile boost",
    kind: "nav",
    href: "/user/boost",
    when: "user poochh raha hai ki unki profile zyada logon tak kaise pahunche, ya boost ki baat ho rahi hai",
  },
  openKundli: {
    label: "Kundli",
    kind: "nav",
    href: "/user/kundli",
    when: "kundli, guna milan, manglik ya janm-patri ki baat ho rahi hai",
  },
  openFamily: {
    label: "Family Circle",
    kind: "nav",
    href: "/user/family",
    when: "parivaar ko jodne, family seat, ya ghar walon ko dikhane ki baat ho rahi hai",
  },
  openInterests: {
    label: "My interests",
    kind: "nav",
    href: "/user/interests",
    when: "bheje ya aaye hue interest, ya unke jawab ka intezaar — iski baat ho rahi hai",
  },

  // ── do (confirm required) ────────────────────────────────────────────────
  analyzeDeepProfile: {
    label: "Analyze Deep Profile",
    kind: "do",
    endpoint: "/api/profile/deep-dimensions/analyze",
    confirm: "Aapki profile ke 13 dimensions abhi analyze karein? Isme kuch second lagte hain.",
    done: "Deep Profile analyze ho gaya",
    when: "Deep Profile abhi analyze nahi hui hai aur user compatibility samajhna chahta hai",
  },
  requestMatchmaker: {
    label: "Request matchmaker",
    kind: "do",
    endpoint: "/api/matchmaker",
    confirm: "Assisted matchmaker se request bhejein? Hamari team aapse khud sampark karegi.",
    done: "Matchmaker request bhej di",
    when: "user insaani madad maang raha hai — sirf Premium plan par kaam karta hai",
  },
  /**
   * The only new `do` this catalog can take today, and the reason is
   * structural rather than a matter of taste: `GrioActionChips` posts every
   * `do` with a literal `"{}"` body, and this file's own marker rule refuses
   * structured arguments. So an action qualifies only if its endpoint needs no
   * input at all. `/api/profile/boost/activate` is exactly that — it spends
   * one held BOOST credit for the signed-in user and nothing else.
   *
   * "Enhance my photo", "invite my family", "answer this question" all fail
   * that test (they need a photo id, an email, a question id), which is why
   * they are `nav` rows above rather than buttons that do the work here.
   */
  activateBoost: {
    label: "Use boost now",
    kind: "do",
    endpoint: "/api/profile/boost/activate",
    confirm:
      "Apna ek BOOST credit abhi kharch karein? Aapki profile agle 24 ghante zyada logon tak pahunchegi.",
    done: "Boost chalu ho gaya — 24 ghante ke liye",
    when: "user ke paas BOOST credit hai aur wo abhi zyada logon tak pahunchna chahte hain — credit na ho to ye button mat dijiye, /user/boost par bhejiye",
  },

  // ── remember ─────────────────────────────────────────────────────────────
  remember: {
    label: "Remember this",
    kind: "remember",
    when: "user ne apne baare me koi aisi baat khud batayi hai jo aage kaam aayegi — sirf unke apne shabd, apna andaza kabhi nahi",
  },
} as const satisfies Record<string, GrioActionSpec>;

export type GrioActionKey = keyof typeof GRIO_ACTIONS;

export function isGrioActionKey(key: string): key is GrioActionKey {
  return Object.prototype.hasOwnProperty.call(GRIO_ACTIONS, key);
}

export type GrioSegment =
  | { type: "text"; value: string }
  | { type: "send"; value: string }
  | { type: "action"; key: GrioActionKey; arg: string | null };

function pushText(segments: GrioSegment[], value: string) {
  if (value.trim()) segments.push({ type: "text", value });
}

/**
 * Splits an assistant reply into renderable segments.
 *
 * Supersedes the `parseSegments` that lived in `GrioChatCore` and handled
 * `<<<SEND>>>` alone. Two behaviours worth stating because they are the
 * difference between a marker being a feature and a marker being a visible
 * bug:
 *
 *  - **A marker never survives into rendered text.** An unterminated
 *    `<<<SEND>>>` (a reply truncated at `maxTokens` mid-suggestion is the real
 *    case) previously fell through to the plain-text branch *including* the
 *    marker itself, so the user read `<<<SEND>>>` on screen. Now the marker is
 *    stripped and the partial line survives as ordinary text — the content was
 *    never the problem, the delimiter was.
 *  - **An unknown or malformed action is dropped silently.** No error, no
 *    placeholder, no raw marker. The user simply gets a reply with one fewer
 *    button than the model intended, which is the correct failure mode for a
 *    control that was only ever a suggestion.
 */
export function parseGrioSegments(content: string): GrioSegment[] {
  const segments: GrioSegment[] = [];
  let rest = content;

  while (rest.length > 0) {
    const sendIdx = rest.indexOf(SEND_MARKER_START);
    const actIdx = rest.indexOf(ACT_MARKER_START);

    if (sendIdx === -1 && actIdx === -1) {
      pushText(segments, rest);
      break;
    }

    const sendFirst = actIdx === -1 || (sendIdx !== -1 && sendIdx < actIdx);
    const startIdx = sendFirst ? sendIdx : actIdx;
    if (startIdx > 0) pushText(segments, rest.slice(0, startIdx));

    if (sendFirst) {
      const afterStart = rest.slice(startIdx + SEND_MARKER_START.length);
      const endIdx = afterStart.indexOf(SEND_MARKER_END);
      if (endIdx === -1) {
        // Truncated mid-suggestion: keep the words, drop the delimiter.
        pushText(segments, afterStart);
        break;
      }
      const value = afterStart.slice(0, endIdx).trim();
      if (value) segments.push({ type: "send", value });
      rest = afterStart.slice(endIdx + SEND_MARKER_END.length);
      continue;
    }

    const afterStart = rest.slice(startIdx + ACT_MARKER_START.length);
    const endIdx = afterStart.indexOf(ACT_MARKER_END);
    if (endIdx === -1) break; // incomplete action key — nothing salvageable
    const body = afterStart.slice(0, endIdx);
    rest = afterStart.slice(endIdx + ACT_MARKER_END.length);

    const colonIdx = body.indexOf(":");
    const key = (colonIdx === -1 ? body : body.slice(0, colonIdx)).trim();
    const arg = colonIdx === -1 ? null : body.slice(colonIdx + 1).trim() || null;
    if (isGrioActionKey(key)) segments.push({ type: "action", key, arg });
  }

  return segments;
}

// ── Grio Memory ────────────────────────────────────────────────────────────

/**
 * The absolute ceiling, above the per-plan ladder.
 *
 * This used to be a flat 8 for everyone, on the reasoning that eight short
 * facts is roughly what a person would tell a matchmaker they'd met a few
 * times. That reasoning still holds — it is now `PLAN_FEATURES.BASIC
 * .grioMemoryFacts`. What changed is that depth became something a plan can
 * buy (`grioMemoryFacts`, lib/constants/plans.ts), because forty facts is a
 * matchmaker who has known you a year and that is a real, sellable difference.
 *
 * This constant survives as the hard stop no plan or admin override can exceed:
 * past roughly this many, the memory block starts competing with the actual
 * conversation for the model's attention, and a memory the user cannot hold in
 * their head is one they cannot audit either.
 */
export const GRIO_MEMORY_MAX_FACTS = 40;
export const GRIO_MEMORY_MAX_FACT_LENGTH = 120;

export interface GrioMemoryResponse {
  ok: boolean;
  facts?: string[];
  message?: string;
  /**
   * The caller's plan limit on *new* facts. Sent on every response so the panel
   * can say "8 me se 8" without a second request — and so it can be honest
   * when `facts.length` exceeds it, which is exactly what a downgrade looks
   * like and is a legal state (see memory.ts: reads are never capped).
   */
  limit?: number;
}
