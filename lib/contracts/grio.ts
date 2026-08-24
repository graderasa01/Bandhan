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
 *  3. **`kind` is the confirm gate — with one deliberate exception.** `nav` is
 *     side-effect-free (a link the user could already reach from the bottom
 *     nav). `do` spends a credit or pings a human, so it routes through a
 *     confirm step in the client the same way `<<<SEND>>>` routes through
 *     `GrioSendConfirm`. `remember` does not: its `when` clause already
 *     restricts it to facts the user just typed themselves, `GrioMemory`'s own
 *     write path enforces the plan's fact cap, and the result is always
 *     visible and deletable in the memory panel — so the tap was friction
 *     protecting nothing, and `GrioChatCore` saves it silently with a toast
 *     instead of a chip.
 *
 * ## Phase H — actions that land on one person
 *
 * Until Phase H nothing here could act *on somebody*; every `do` was body-less
 * and about the user themselves. The reason was mechanical (the marker refuses
 * structured arguments, so no id could reach an endpoint) but the safety
 * argument underneath it was real: an assistant that names who to act on is one
 * prompt away from ranking people, which D-32 reserves for the deterministic
 * pipeline.
 *
 * Phase H opens the capability without weakening that argument, by separating
 * the two halves of an action:
 *
 *   **The model chooses the verb. The user chooses the person.**
 *
 * A targeted row declares `needs: "profile" | "match"` and builds its call
 * through `request(target)`. The `target` never comes from the model's text —
 * it is either the scope the user opened (a profile they navigated to
 * themselves) or a row they tapped in `GrioPersonPicker`. So the model can
 * propose "send an interest" and can never propose *to whom*: there is no
 * syntax for it, not merely a rule against it.
 */

import {
  SEND_MARKER_START,
  SEND_MARKER_END,
  ASK_MARKER_START,
  WHO_MARKER_START,
  DO_MARKER_START,
  LEARN_MARKER_START,
} from "./concierge";

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

export type GrioActionKind = "nav" | "do" | "sheet" | "remember";

/**
 * What a targeted action needs before it can run, and therefore what the client
 * has to resolve — from scope if the user is already on that person, from the
 * picker otherwise. Never from the reply.
 */
export type GrioActionTarget = "profile" | "match";

/** Which in-overlay sheet a `sheet` action opens. */
export type GrioActionSheet =
  | "voiceNote"
  | "answerQuestion"
  | "todayPoll"
  | "rishtaReflection"
  | "rishtaMeeting"
  | "rishtaTopic";

/** The HTTP call a targeted `do` makes, built by code from a code-supplied id. */
export interface GrioActionCall {
  url: string;
  method: "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
}

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
  /**
   * `do`/`sheet` only — whose id this action needs before it can run.
   *
   * Its presence is what makes the client ask "on whom?" instead of assuming.
   * A row without it is about the signed-in user alone.
   */
  needs?: GrioActionTarget;
  /**
   * `do` + `needs` only — builds the request from an id the *user* supplied.
   *
   * A function rather than a template string so the shape of each call
   * (path param vs body field, POST vs PUT) stays with the row that knows it,
   * instead of becoming a switch in the component that fires it.
   */
  request?: (target: string) => GrioActionCall;
  /** `sheet` only — the recorder to open; nothing is posted by the chip itself. */
  sheet?: GrioActionSheet;
  /** `do` only — what the confirm sheet asks before anything happens. */
  confirm?: string;
  /** `do`/`sheet` — success toast. */
  done?: string;
  /**
   * The sentence code writes back into the conversation after a successful run.
   *
   * Not cosmetic: the transcript is what the model reads next turn, so without
   * this Grio keeps offering a button the user already pressed and answers the
   * follow-up question ("to ab kya hoga?") as if nothing happened. Falls back
   * to `done`. Code's words, never the model's — same rule as `label`.
   */
  outcome?: string;
}

/**
 * Every action Grio can propose. Adding a row here is the *entire* act of
 * granting a capability, which is why each `do` row points at an endpoint that
 * already enforces its own plan gate and ownership check — the button is a
 * shortcut to an existing door, never a new door.
 *
 * Nothing that ranks, unlocks, pays, or deletes appears here. Reaching another
 * person *does* now appear here (interest, voice note, shortlist), which is the
 * Phase H change; what has not changed is that the model cannot say who — see
 * the `needs`/`request` note in this file's header.
 *
 * `sendMessage` is absent on purpose: it already has a richer flow of its own
 * (`<<<SEND>>>` → picker → confirm) because the text has to stay editable up to
 * the last moment. Asking a question is absent for the same reason and has the
 * same shape (`<<<ASK>>>`).
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
    when: "user apni saved list *dekhna* chahta hai — agar wo shortlist me se kisi ko kuch bhejna chahte hain to ye nahi, wo bhejne wala button dijiye",
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
  openAdvancedDiscovery: {
    label: "Advanced Discovery",
    kind: "nav",
    href: "/user/discover",
    when: "user apni khud ki search chalana chahta hai, filters (sheher/age/education/verified/trust) badalna chahta hai, ya poochh raha hai ki unka Reel STRICT/FLEXIBLE kyun aisa dikh raha hai — Advanced Discovery na ho to bhi ye button dijiye, wahan preview khud dikh jayega",
  },
  openContactVerification: {
    label: "Verify Contact",
    kind: "nav",
    href: "/user/verify-contact",
    when: "mobile ya email verify nahi hua hai aur user verify karna chahta hai, ya trust score badhane ka poochh raha hai — sirf tab jab AAPKE USER KI ABHI KI SITUATION ke Verification block me se koi ek 'verify nahi hua' dikh raha ho",
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
   * Body-less by nature: it spends one held BOOST credit for the signed-in user
   * and takes no input at all, so it needs neither `needs` nor `request`.
   *
   * This used to be the *only* kind of `do` the catalog could hold, because
   * `GrioActionChips` posted every action with a literal `"{}"`. Phase H lifted
   * that with `request()` — but only for ids the user supplies. "Enhance my
   * photo" and "invite my family" still fail the test and stay `nav` rows: the
   * first needs a photo the model would have to choose, the second an email
   * address it would have to compose, and neither is a thing a finger can hand
   * over by tapping a person.
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

  // ── do, aimed at one person (Phase H) ────────────────────────────────────
  //
  // The rule that lets these exist at all: every row below is a shortcut to a
  // control the user can already press on `/user/profile/[id]`, posting to the
  // same endpoint with the same body. None of them is reachable without an id
  // the user themselves produced.
  shortlistProfile: {
    label: "Save to shortlist",
    kind: "do",
    needs: "profile",
    request: (profileId) => ({ url: `/api/shortlist/${profileId}`, method: "PUT" }),
    confirm: "Is profile ko apni shortlist me save karein? Unhe iski koi khabar nahi jayegi.",
    done: "Shortlist me save ho gaya",
    outcome:
      "Ye profile aapki shortlist me save ho gayi hai. Unhe iski koi soochna nahi jaati — ye sirf aapki apni list hai.",
    when: "user kisi profile ko baad ke liye rakhna/save/shortlist karna chahta hai — chahe koi profile khuli ho ya na ho, ye button de dijiye",
  },
  sendInterestToProfile: {
    label: "Send interest",
    kind: "do",
    needs: "profile",
    request: (profileId) => ({ url: "/api/interests", method: "POST", body: { profileId } }),
    confirm:
      "Interest bhejein? Ye unhe dikhega, is mahine ke quota me se ek kharch hoga, aur 24 ghante ke andar hi wapas liya ja sakta hai.",
    done: "Interest bhej diya",
    outcome: "Interest bhej diya gaya hai — ab unke jawab ka intezaar hai.",
    when: "user interest bhejna/haan kehna/'like' karna chahta hai — chahe koi profile khuli ho ya na ho, ye button de dijiye; profile khuli na ho to app khud unse poochh lega ki kis par",
  },

  // ── sheet: chip ek recorder kholta hai, khud kuch post nahi karta ────────
  //
  // These two exist as their own kind because their real endpoints take a file
  // (`/api/media/voice` is multipart) or an id the user must pick from a list.
  // Neither can be a body-less `do`, and neither should be a `nav` that throws
  // the user out of the conversation — so the chip opens the same recorder the
  // rest of the app uses, inside the overlay.
  sendVoiceNote: {
    label: "Record voice note",
    kind: "sheet",
    needs: "profile",
    sheet: "voiceNote",
    done: "Voice note bhej diya",
    outcome:
      "Voice note bhej diya gaya hai. Iske saath ek interest bhi gaya hai, aur moderation clear hone par hi wo unhe sunai dega.",
    when: "user apni awaaz me kisi ek rishtey tak apni baat pahunchana chahta hai — batana mat bhooliye ki isme ek interest bhi kharch hota hai",
  },
  answerPendingQuestion: {
    label: "Answer questions",
    kind: "sheet",
    sheet: "answerQuestion",
    done: "Jawab bhej diya",
    outcome: "Aapka voice jawab bhej diya gaya hai.",
    when: "aapke user ke paas aaye hue sawaal jawab ka intezaar kar rahe hain aur wo abhi unka jawab dena chahte hain",
  },
  /**
   * The one `sheet` that reaches nobody — it records the user's own answer to
   * today's Vibe Hub question. It is here rather than as a `nav` to /user/vibe
   * because it is the only action in this catalog whose *point* is to make a
   * later answer better: soch fit cannot be measured until two people have
   * answered enough of the same questions, so this is the button Grio needs
   * when it has just had to tell someone their "soch ka mel" is blank.
   */
  answerTodayPoll: {
    label: "Answer today's question",
    kind: "sheet",
    sheet: "todayPoll",
    done: "Jawab de diya",
    outcome:
      "Aaj ke sawaal ka jawab de diya gaya hai — ye 'soch ka mel' me ginta hai, aur ab aapko wo log bhi dikhenge jinhone yahi jawab chuna.",
    when: "roz ke Vibe Hub sawaal ki baat ho rahi hai, ya 'soch ka mel' napa nahi ja saka aur user use bharna chahta hai",
  },

  /*
   * ── the rishta journey's three writes ──────────────────────────────────
   *
   * Phase 8 asked for a long action list — GET_MY_TODAY, WHAT_DO_YOU_KNOW,
   * GET_RISHTA_SUMMARY, EXPLAIN_CANDIDATE and so on — and most of it is
   * deliberately absent, because those are **reads** and Grio already has every
   * one of them sitting in its prompt. An action that fetches what is already
   * in context would add a round-trip, a button and a failure mode to produce
   * information the model could already see. `UPDATE_MY_PREFERENCE` and
   * `ANSWER_INTELLIGENCE_QUESTION` are likewise already built, as `<<<LEARN:>>>`;
   * `DRAFT_NEXT_QUESTION` is `<<<ASK>>>`.
   *
   * What was genuinely missing is the other direction: the three things a user
   * can only record *about* a rishta, which no existing surface captured. Each
   * one is a `sheet` rather than a `do`, because all three carry the user's own
   * words and the model must never be the one writing them.
   */
  saveRishtaReflection: {
    label: "Save a note",
    kind: "sheet",
    sheet: "rishtaReflection",
    needs: "profile",
    done: "Note save ho gaya",
    outcome:
      "Aapka note is rishtey ke saath save ho gaya hai. Ye sirf aapko dikhta hai — na unhe, na ghar walon ko.",
    when: "user is rishtey ke baare me apne liye kuch likh kar rakhna chahta hai — jaisa unhe laga, kya achha lagaa, kis baat par shak hai",
  },
  addRishtaMeeting: {
    label: "Add a meeting",
    kind: "sheet",
    sheet: "rishtaMeeting",
    needs: "profile",
    done: "Mulaqat save ho gayi",
    outcome: "Mulaqat is rishtey ke record me jud gayi hai.",
    when: "milne ka plan ban raha hai ya mulaqat ho chuki hai aur user use record karna chahta hai",
  },
  markRishtaTopicResolved: {
    label: "Mark topic done",
    kind: "sheet",
    sheet: "rishtaTopic",
    needs: "profile",
    done: "Topic done mark ho gaya",
    outcome: "Wo baat ab 'ho chuki' me chali gayi hai — agli baar unresolved list me nahi aayegi.",
    when: "user keh raha hai ki koi baat unke beech clear ho gayi hai — jaise 'relocation par baat ho gayi', 'bachchon wali baat sulajh gayi'",
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

/**
 * The extra sentence when an interest turns out to be mutual.
 *
 * Code's, like every other outcome line, and separate from
 * `sendInterestToProfile.outcome` because the endpoint answers `matched: true`
 * only sometimes — and "ab intezaar hai" would be a plainly wrong thing to tell
 * someone whose chat just opened.
 */
export const GRIO_OUTCOME_MATCHED =
  "Aur ye match ban gaya — unhone bhi aapko interest bheja hua tha, to ab chat khul gayi hai.";

/**
 * What Grio will not do, in the model's own language — and, in every line, who
 * *can* do it instead.
 *
 * The catalog answers "what can be offered". This answers the question the
 * catalog is silent on: what to say when the user asks for something that is
 * deliberately not in it. Without this the model improvises a refusal, and an
 * improvised refusal is either apologetically vague ("main ye nahi kar sakta")
 * or quietly wrong ("theek hai, kar diya") — the first teaches users the
 * feature is broken, the second is worse.
 *
 * Every line therefore pairs a boundary with a route, because a "no" that ends
 * the conversation is indistinguishable from a bug. These are limits of
 * *authority*, not of knowledge, which is why they live here next to the
 * capability list rather than in the persona prompt: they are the same fact
 * seen from the other side.
 *
 * Static, so it rides in the cached `system` block.
 */
export const GRIO_LIMITS = [
  // Reworded when `<<<DO:` arrived. The old line promised that every interest
  // was "aapka apna tap", which stopped being true the day a spoken "interest
  // bhej do" started running on its own. The boundary did not move — Grio still
  // never reaches anybody unasked — so the line now draws it where it actually
  // sits: on who asked, not on who tapped. A limit stated more strictly than the
  // code enforces is the kind a user finds out about the wrong way.
  "Jo aap khud keh kar bolte hain wo main turant kar deta hoon — interest bheja, shortlist kiya. Par apne aap se main kabhi kisi tak nahi pahunchta: bina aapke kahe koi interest, voice note ya sawaal kahin nahi jaata, main sirf button saamne rakhta hoon.",
  // Reworded when the roster arrived. The old line justified the refusal with
  // "mujhe ek waqt me ek hi profile dikhti hai", which stopped being true the
  // day Grio was handed a list of names — and a boundary defended with a
  // sentence the model can see is false is a boundary it will eventually argue
  // its way past. The refusal is the same; the reason is now the real one.
  "Do logon me se behtar kaun hai, ye faisla main kabhi nahi karta. Code ka nikala hua kram main padh kar suna sakta hoon — 'is hisaab se sabse upar kaun hai' — par 'aapke liye kaun sahi hai' wo aapka apna faisla hai, aur uske liye mere paas koi raay hai hi nahi.",
  "Kisi ki photo, contact number ya chhupi hui field main nahi khol sakta. Wo interest aur match ke saath khud khulti hain; kaunsi kab khulegi, wo main bata sakta hoon.",
  "Payment, plan badalna ya paisa wapas karna main nahi kar sakta — wo aap Plans & billing page par khud karte hain.",
  "Aapki profile ki koi field main khud nahi bhar sakta aur na badal sakta hoon — page khol kar de sakta hoon, likhna aapko hi hoga.",
  "Voice note aur aaye hue sawaal ka jawab main aapke liye record nahi kar sakta — awaaz aapki honi hai. Aap kahenge to recorder turant khol dunga, bhejna aapke haath me hi rahega.",
  // Added alongside Advanced Discovery, restated here rather than only inside
  // the Rishta Lens dossier because a user can ask about their own kundli
  // (openKundli) in an unscoped turn too, where the dossier's own line never
  // loads.
  "Kundli aur guna milan main samjha sakta hoon, par ye BandhanTak ki matching ka hissa kabhi nahi hai — aapko kaun dikhta hai wo isse tay nahi hota. Ye sirf parampara ka ek paimana hai, faisla nahi.",
] as const;

export type GrioSegment =
  | { type: "text"; value: string }
  | { type: "send"; value: string }
  | { type: "ask"; value: string }
  | { type: "action"; key: GrioActionKey; arg: string | null }
  /**
   * The same catalog row as `action`, requested by the user rather than offered
   * by Grio — see `DO_MARKER_START`. Carried as its own segment type rather
   * than a flag on `action` so that a consumer which has not been taught about
   * auto-running cannot silently treat one as the other.
   */
  | { type: "run"; key: GrioActionKey; arg: string | null }
  /**
   * A roster ordinal, not a person. Resolving it against a list is the
   * caller's job — see `WHO_MARKER_START` for why the id can only ever come
   * from that side.
   */
  | { type: "who"; n: number }
  /**
   * A Marriage Intelligence answer the user gave in conversation, awaiting
   * their confirmation — see `LEARN_MARKER_START`.
   *
   * Only the *shape* is checked here (a key and a value, both non-empty). The
   * key is deliberately not validated against the catalog the way an action key
   * is, for two reasons: this module is imported by every Grio surface and the
   * catalog is 1,200 lines of question data none of them need, and — more to
   * the point — the right response to an unrecognised key is not the silent
   * drop that suits a stray button. The renderer holds the catalog, so it is
   * the renderer that decides whether to show the exact option, fall back to
   * the full option list, or show nothing at all.
   */
  | { type: "learn"; key: string; value: string };

/**
 * The two markers that carry a span of text the user can edit before it is
 * sent, as opposed to `<<<ACT:` which carries a key. They share a terminator
 * and differ only in where the text lands.
 */
const TEXT_MARKERS = [
  { start: SEND_MARKER_START, type: "send" as const },
  { start: ASK_MARKER_START, type: "ask" as const },
];

/**
 * The other family: markers whose body is a key or a number rather than a span
 * of the user's prose. They share `>>>` as a terminator and differ only in how
 * the body is read, so scanning them together is what stops an `<<<ACT:` that
 * follows a `<<<WHO:` from being swallowed by it.
 */
const KEY_MARKERS = [
  { start: ACT_MARKER_START, type: "action" as const },
  { start: DO_MARKER_START, type: "run" as const },
  { start: WHO_MARKER_START, type: "who" as const },
  { start: LEARN_MARKER_START, type: "learn" as const },
];

/**
 * Any `<<<…>>>` this build does not know about.
 *
 * Not defensive padding — this fired in the wild. The turn `<<<DO:` shipped, a
 * browser still holding the previous bundle received a reply containing it,
 * found no matching entry in its `KEY_MARKERS`, and fell through to the
 * plain-text branch — so the user read `<<<DO:sendInterestToProfile>>>` on
 * screen, verbatim, as though Grio had started speaking in tags.
 *
 * That is the same failure this file already fixed once for unterminated
 * `<<<SEND>>>`, and it will recur on every future marker: the server always
 * updates before the open tabs do, so for one reload's worth of time some
 * clients are always a vocabulary behind. Stripping the unknown ones makes that
 * window degrade to "one fewer button" — the documented failure mode for a
 * malformed action — instead of leaking syntax into the conversation.
 */
const UNKNOWN_MARKER = /<<<[^>]*>>>/g;

function pushText(segments: GrioSegment[], value: string) {
  const cleaned = value.replace(UNKNOWN_MARKER, "");
  if (cleaned.trim()) segments.push({ type: "text", value: cleaned });
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
    // Whichever marker opens first wins the next span. Scanning all three
    // together (rather than the old two-way compare) is what keeps a
    // `<<<ASK>>>` sitting between a sentence and an `<<<ACT:` from swallowing
    // either of its neighbours.
    let firstText: { index: number; marker: (typeof TEXT_MARKERS)[number] } | null = null;
    for (const marker of TEXT_MARKERS) {
      const idx = rest.indexOf(marker.start);
      if (idx !== -1 && (firstText === null || idx < firstText.index)) firstText = { index: idx, marker };
    }
    let firstKey: { index: number; marker: (typeof KEY_MARKERS)[number] } | null = null;
    for (const marker of KEY_MARKERS) {
      const idx = rest.indexOf(marker.start);
      if (idx !== -1 && (firstKey === null || idx < firstKey.index)) firstKey = { index: idx, marker };
    }

    if (firstText === null && firstKey === null) {
      pushText(segments, rest);
      break;
    }

    const textFirst = firstText !== null && (firstKey === null || firstText.index < firstKey.index);
    const startIdx = textFirst ? firstText!.index : firstKey!.index;
    if (startIdx > 0) pushText(segments, rest.slice(0, startIdx));

    if (textFirst) {
      const { start, type } = firstText!.marker;
      const afterStart = rest.slice(startIdx + start.length);
      const endIdx = afterStart.indexOf(SEND_MARKER_END);
      if (endIdx === -1) {
        // Truncated mid-suggestion: keep the words, drop the delimiter.
        pushText(segments, afterStart);
        break;
      }
      const value = afterStart.slice(0, endIdx).trim();
      if (value) segments.push({ type, value });
      rest = afterStart.slice(endIdx + SEND_MARKER_END.length);
      continue;
    }

    const { start, type } = firstKey!.marker;
    const afterStart = rest.slice(startIdx + start.length);
    const endIdx = afterStart.indexOf(ACT_MARKER_END);
    if (endIdx === -1) break; // incomplete marker — nothing salvageable
    const body = afterStart.slice(0, endIdx);
    rest = afterStart.slice(endIdx + ACT_MARKER_END.length);

    if (type === "who") {
      // `Number.isInteger` on a trimmed parse rather than `parseInt`: the latter
      // reads "3 logon" as 3, which would turn a sentence the model wrote by
      // mistake into a silent scope change. Anything that is not cleanly a
      // positive integer resolves to nobody, like any other malformed marker.
      const n = Number(body.trim());
      if (Number.isInteger(n) && n > 0) segments.push({ type: "who", n });
      continue;
    }

    if (type === "learn") {
      // `key=value`, split on the *first* `=` only: an option is free text from
      // the catalog and "Haan, 1–2 saal me" is allowed to contain one.
      const eqIdx = body.indexOf("=");
      if (eqIdx === -1) continue;
      const learnKey = body.slice(0, eqIdx).trim();
      const learnValue = body.slice(eqIdx + 1).trim();
      if (learnKey && learnValue) segments.push({ type: "learn", key: learnKey, value: learnValue });
      continue;
    }

    const colonIdx = body.indexOf(":");
    const key = (colonIdx === -1 ? body : body.slice(0, colonIdx)).trim();
    const arg = colonIdx === -1 ? null : body.slice(colonIdx + 1).trim() || null;
    // Same key space, same silent-drop rule for an unknown one — the only
    // difference is whether the caller offers it or runs it.
    //
    // Written as two literals rather than `{ type, key, arg }` because `learn`
    // also carries a `key`, and once two members of `GrioSegment` share a
    // property name TypeScript stops distributing a union-typed discriminant
    // over the target union. The branch is the compiler's price for the shared
    // field, not a behavioural difference.
    if (!isGrioActionKey(key)) continue;
    segments.push(type === "action" ? { type: "action", key, arg } : { type: "run", key, arg });
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

/**
 * The kinds a memory can be, mirrored from `GrioMemoryKind` in the schema.
 *
 * Re-declared here rather than imported from `@prisma/client` because this
 * module is imported by client components, and pulling the Prisma client into a
 * browser bundle to read six string literals is a bad trade. The check that
 * they stay in step is `scripts/grio-memory-check.ts`, which imports both and
 * asserts the sets are identical — a compile-time link would be nicer, and a
 * runtime assertion in a test is what is available without the import.
 */
export const GRIO_MEMORY_KINDS = [
  "FACT",
  "PREFERENCE",
  "BOUNDARY",
  "GOAL",
  "RELATIONSHIP_NOTE",
  "TEMPORARY_CONTEXT",
] as const;

export type GrioMemoryKindValue = (typeof GRIO_MEMORY_KINDS)[number];

/** Panel labels. English per the app's control-label convention. */
export const GRIO_MEMORY_KIND_LABEL: Record<GrioMemoryKindValue, string> = {
  FACT: "Fact",
  PREFERENCE: "Preference",
  BOUNDARY: "Deal-breaker",
  GOAL: "Goal",
  RELATIONSHIP_NOTE: "Note about a rishta",
  TEMPORARY_CONTEXT: "Temporary",
};

/** One remembered thing, as the panel renders it. */
export interface GrioMemoryItem {
  id: string;
  body: string;
  kind: GrioMemoryKindValue;
  confirmed: boolean;
  createdAt: string;
  expiresAt: string | null;
  /** What this replaced, so the panel can show "pehle X kaha tha". */
  replaces: string | null;
}

export interface GrioMemoryResponse {
  ok: boolean;
  /**
   * Bodies only, kept because the overlay's "Remember this" path and the
   * dedupe check never needed more. `items` is the richer view the panel reads.
   */
  facts?: string[];
  items?: GrioMemoryItem[];
  message?: string;
  /**
   * The caller's plan limit on *new* facts. Sent on every response so the panel
   * can say "8 me se 8" without a second request — and so it can be honest
   * when `facts.length` exceeds it, which is exactly what a downgrade looks
   * like and is a legal state (see memory.ts: reads are never capped).
   */
  limit?: number;
}
