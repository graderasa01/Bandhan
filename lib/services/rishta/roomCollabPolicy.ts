import type {
  ProfileDelegatePermission,
  RishtaMeetingFeeling,
  RishtaRequestKind,
  RishtaRequestStatus,
  RishtaTaskParty,
} from "@prisma/client";

/**
 * The Rishta Room's collaboration rulebook — client-safe, and the one place
 * that decides what a helper standing inside a rishta may do.
 *
 * Phase 1's policy file owns delegation permissions in general and Phase 3's
 * owns what the desk does with them. This one owns the room: which permission
 * unlocks which request, how many may be pending at once, and the words the
 * owner reads while deciding.
 *
 * Nothing here imports Prisma or `server-only` — the owner's room, the family
 * portal and the partner desk all render these labels, and three copies of the
 * same sentence would eventually disagree about what a permission means.
 */

/* ------------------------------------------------------------------ */
/* Permissions the room understands                                    */
/* ------------------------------------------------------------------ */

/**
 * The three request permissions, in the order an owner would grant them:
 * involve my family, set up a call, fix a meeting. Each is strictly more
 * consequential than the one before, and none of them does anything by itself.
 */
export const ROOM_PERMISSIONS: readonly ProfileDelegatePermission[] = [
  "REQUEST_FAMILY_INTRO",
  "REQUEST_CALL",
  "REQUEST_MEETING",
];

/**
 * One permission per request kind, and no default.
 *
 * Written as a total map rather than a lookup with a fallback so that adding a
 * fourth kind is a type error here instead of an unguarded endpoint there.
 */
export const PERMISSION_FOR_REQUEST: Record<RishtaRequestKind, ProfileDelegatePermission> = {
  FAMILY_INTRO: "REQUEST_FAMILY_INTRO",
  CALL: "REQUEST_CALL",
  MEETING: "REQUEST_MEETING",
};

export function isRoomPermission(p: ProfileDelegatePermission): boolean {
  return (ROOM_PERMISSIONS as readonly string[]).includes(p);
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export const MIN_REQUEST_NOTE_CHARS = 10;
export const MAX_REQUEST_NOTE_CHARS = 500;
export const MAX_OWNER_NOTE_CHARS = 300;
export const MAX_TASK_TITLE_CHARS = 140;
export const MAX_CHECKPOINT_NOTE_CHARS = 700;
export const MAX_REQUEST_PLACE_CHARS = 120;

/**
 * How many undecided requests one helper may have in one rishta.
 *
 * Deliberately small, and deliberately per-helper-per-room. Phase 3 capped
 * pending proposals at ten because a proposal is a suggestion the owner can
 * ignore; a request is a question they have to answer, in a relationship they
 * are already inside. Three unanswered questions is a helper who should pick up
 * the phone, not file a fourth.
 *
 * The service adds a second rule the number cannot express: only one PROPOSED
 * request per kind. Asking twice for the same meeting is nagging with a
 * timestamp on it.
 */
export const MAX_PENDING_REQUESTS_PER_ROOM = 3;

/**
 * Open tasks per rishta, across everybody.
 *
 * A room with fifteen open tasks has stopped being a next step and become a
 * project plan, and the product's promise is one clear next action.
 */
export const MAX_OPEN_TASKS_PER_ROOM = 12;

/** How far ahead a request may propose a time. A year out is not a plan. */
export const MAX_REQUEST_LEAD_DAYS = 120;

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export const REQUEST_KIND_LABEL: Record<RishtaRequestKind, string> = {
  FAMILY_INTRO: "Ghar walon ko jodne ki baat",
  CALL: "Call karwane ki baat",
  MEETING: "Mulaqat ki baat",
};

/** What the owner is actually being asked to decide, in one line. */
export const REQUEST_KIND_ASK: Record<RishtaRequestKind, string> = {
  FAMILY_INTRO: "Ye keh rahe hain ki ab ghar walon ko is rishtey me jodna chahiye.",
  CALL: "Ye keh rahe hain ki ab ek call honi chahiye.",
  MEETING: "Ye keh rahe hain ki ab mulaqat tay honi chahiye.",
};

export const REQUEST_STATUS_LABEL: Record<RishtaRequestStatus, string> = {
  PROPOSED: "Aapke jawaab ka intezaar",
  APPROVED: "Aapne haan ki",
  DECLINED: "Aapne mana kiya",
  WITHDRAWN: "Wapas le liya gaya",
};

export const TASK_PARTY_LABEL: Record<RishtaTaskParty, string> = {
  OWNER: "Aap",
  FAMILY: "Ghar wale",
  PARTNER: "Partner",
};

export const MEETING_FEELING_LABEL: Record<RishtaMeetingFeeling, string> = {
  WENT_WELL: "Theek raha — aage badhna chahiye",
  UNSURE: "Abhi tay nahi kar pa raha/rahi hoon",
  NOT_RIGHT: "Ye rishta mere liye nahi hai",
  FELT_UNSAFE: "Kuch theek nahi laga",
};

/**
 * The order the four are shown in, which is not the enum's order by accident:
 * the two that keep a rishta alive come first, so the checkpoint does not read
 * as a form for ending things.
 */
export const MEETING_FEELING_ORDER: readonly RishtaMeetingFeeling[] = [
  "WENT_WELL",
  "UNSURE",
  "NOT_RIGHT",
  "FELT_UNSAFE",
];

/** Tasks the room offers as chips. Suggestions only — the owner may type anything. */
export const SUGGESTED_TASKS: readonly string[] = [
  "Ghar par baat karni hai",
  "Unse call ka time poochhna hai",
  "Mulaqat ki jagah tay karni hai",
  "Kundli dikhani hai",
  "Papa/Mummy se milwana hai",
];

/**
 * Under every helper card in the room.
 *
 * The same anti-dark-pattern reflex as `PROPOSAL_DISCLOSURE`: the owner is
 * entitled to know exactly how much of their relationship the person helping
 * them can actually see, stated as a limit rather than a reassurance.
 */
export const PARTICIPANT_DISCLOSURE =
  "Inhe is rishtey ka stage, kaam aur mulaqat ki tareekh dikhti hai. Aapki chat, aapke apne note aur mulaqat ke baad ka aapka jawaab kabhi nahi dikhta.";

/** Shown to the helper themselves, so nobody has to guess what they can see. */
export const PARTICIPANT_SELF_DISCLOSURE =
  "Aapko is rishtey ka stage, kaam aur tay hui mulaqat dikhti hai. Chat, private note aur inka apna jawaab aapko nahi dikhta.";
