import { PROFILE_FIELDS, FIELD_BY_KEY } from "@/lib/profile/fields";
import type { ManagedDraftStatus, ProfileDelegatePermission } from "@prisma/client";

/**
 * The Managed Profile rulebook — one file, read by both the API and the UI.
 *
 * Deliberately free of `prisma` and `server-only` so the partner's client list,
 * the owner's review screen and every route handler can import the *same*
 * constants. The alternative — a server list and a client list that "should"
 * agree — is how a review screen ends up bulk-confirming a field the server
 * considers sensitive, which is exactly the failure this whole phase exists to
 * prevent.
 *
 * Nothing here reads a database or an environment variable. Anything that
 * needs to decide who may act lives in `managedEligibility.ts`; anything that
 * needs to decide what a value *is* lives here.
 */

/* ------------------------------------------------------------------ */
/* Which fields a managed draft may hold                               */
/* ------------------------------------------------------------------ */

/**
 * Every catalog field a partner/family helper may propose — the whole
 * `PROFILE_FIELDS` catalog *minus photos*.
 *
 * Photos are excluded structurally rather than by a UI decision: a face is the
 * one piece of profile data whose publication is irreversible and whose
 * consent cannot be inferred from "somebody typed it into a form". The owner
 * uploads and approves their own photos after claiming (they show up as an
 * owner task on the review screen). This also means the deck can be pointed at
 * this list with `only={...}` and the photo card simply never appears — no
 * managed-mode branch inside `SmartProfileDeck` at all.
 */
export const MANAGED_DRAFT_FIELD_KEYS: readonly string[] = PROFILE_FIELDS.filter(
  (f) => f.type !== "photo",
).map((f) => f.key);

const MANAGED_KEY_SET = new Set(MANAGED_DRAFT_FIELD_KEYS);

export function isManagedDraftField(key: string): boolean {
  return MANAGED_KEY_SET.has(key);
}

/* ------------------------------------------------------------------ */
/* Sensitive confirmation                                              */
/* ------------------------------------------------------------------ */

/**
 * Facts that must be confirmed one at a time, never in a bulk "confirm all".
 *
 * `field.sensitive` in the catalog was the obvious candidate and is not enough
 * on its own, in both directions:
 *
 *  - It misses `fullName`, `gender`, `dateOfBirth` and `maritalStatus`. None of
 *    those is *private* — they are on the public card — but every one of them
 *    is **identity-defining**, and a partner quietly getting a date of birth or
 *    a marital status wrong is precisely the harm a claim flow exists to catch.
 *    "Sensitive to show" and "must be personally confirmed" are two different
 *    questions and the catalog only ever answered the first.
 *  - `nativePlace`/`workLocation` carry no `sensitive` flag and correctly stay
 *    ordinary here.
 *
 * So this is its own explicit list rather than a derived one. It is a superset
 * of the catalog's `sensitive` fields — asserted below, so a newly-flagged
 * sensitive field can never silently become bulk-confirmable.
 */
export const SENSITIVE_CONFIRM_KEYS: readonly string[] = [
  "fullName",
  "gender",
  "dateOfBirth",
  "maritalStatus",
  "religion",
  "caste",
  "annualIncome",
  "manglikStatus",
  "gotra",
  "birthTime",
  "birthPlace",
  "partnerReligionPreference",
  "partnerCastePreference",
  "partnerManglikPreference",
  "dealBreakers",
];

const SENSITIVE_SET = new Set(SENSITIVE_CONFIRM_KEYS);

/**
 * The one function that answers "may this be bulk-confirmed?". Both the review
 * API and the review screen call it; neither keeps its own list.
 */
export function requiresIndividualConfirmation(fieldKey: string): boolean {
  return SENSITIVE_SET.has(fieldKey);
}

/**
 * Guard, not decoration: every catalog field carrying `sensitive: true` must
 * appear above. Runs at import time, so adding a sensitive field to the
 * catalog without listing it here fails the build's first import rather than
 * shipping a field that a "Confirm all" button would sweep up.
 */
const UNLISTED_SENSITIVE = PROFILE_FIELDS.filter(
  (f) => f.sensitive && !SENSITIVE_SET.has(f.key),
).map((f) => f.key);
if (UNLISTED_SENSITIVE.length > 0) {
  throw new Error(
    `managedProfilePolicy: catalog fields marked sensitive but missing from SENSITIVE_CONFIRM_KEYS: ${UNLISTED_SENSITIVE.join(", ")}`,
  );
}

/** Catalog fields the owner must answer before the profile can go live. */
export const REQUIRED_FIELD_KEYS: readonly string[] = PROFILE_FIELDS.filter(
  (f) => f.required && f.type !== "photo",
).map((f) => f.key);

export function labelFor(fieldKey: string): string {
  return FIELD_BY_KEY[fieldKey]?.label ?? fieldKey;
}

/* ------------------------------------------------------------------ */
/* Claim token                                                         */
/* ------------------------------------------------------------------ */

/** 48 hours — long enough to reach someone who is asleep, short enough that a
 *  forwarded WhatsApp message stops working within the week. */
export const CLAIM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

/** Regeneration is cheap for the partner and noisy for the claimant, so it is
 *  capped per draft per rolling hour rather than left open. */
export const MAX_CLAIM_LINKS_PER_HOUR = 5;
export const CLAIM_RATE_WINDOW_MS = 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Delegation                                                          */
/* ------------------------------------------------------------------ */

/**
 * What the owner is offered **at claim time**, on the review screen.
 *
 * Deliberately only the three profile permissions. The Client Desk's
 * search/propose/draft permissions (Phase 3) exist and are grantable — but not
 * here: asking somebody to authorise "search on my behalf" in the same breath
 * as claiming their own profile bundles two unrelated decisions into one tap.
 * Those are granted later, on `/user/profile/access`, once the owner has
 * actually worked with the partner.
 */
export const CLAIM_TIME_PERMISSIONS: readonly ProfileDelegatePermission[] = [
  "VIEW_CONFIRMED_PROFILE",
  "PROPOSE_PROFILE_EDIT",
  "VIEW_REVIEW_STATUS",
];

/**
 * Every permission an owner may grant at all. Still the same rule as Phase 1:
 * each value does something today, and there is no `FULL_ACCESS`.
 */
export const GRANTABLE_PERMISSIONS: readonly ProfileDelegatePermission[] = [
  ...CLAIM_TIME_PERMISSIONS,
  "SEARCH_FOR_CLIENT",
  "PROPOSE_SHORTLIST",
  "DRAFT_MESSAGE",
];

const PERMISSION_SET = new Set<string>(GRANTABLE_PERMISSIONS);

/** Anything outside the grantable set is dropped, not stored-and-ignored. */
export function sanitizePermissions(raw: unknown): ProfileDelegatePermission[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<ProfileDelegatePermission>();
  for (const p of raw) {
    if (typeof p === "string" && PERMISSION_SET.has(p)) out.add(p as ProfileDelegatePermission);
  }
  return [...out];
}

export const PERMISSION_LABELS: Record<ProfileDelegatePermission, string> = {
  VIEW_CONFIRMED_PROFILE: "Aapki confirm ki hui profile details dekh sakte hain",
  PROPOSE_PROFILE_EDIT: "Nayi details suggest kar sakte hain — lagengi tabhi jab aap confirm karein",
  VIEW_REVIEW_STATUS: "Dekh sakte hain ki aapka review kitna baaki hai",
  // Phase 3 — each says what the partner cannot do in the same breath, because
  // all three are easy to over-read as "act on my behalf".
  SEARCH_FOR_CLIENT:
    "Aapki hi pasand ke hisaab se profiles dhoondh sakte hain — jo aapko dikhti hain, wahi unhe dikhengi",
  PROPOSE_SHORTLIST:
    "Kisi ko aapke saamne rakh sakte hain, wajah ke saath — lagega tabhi jab aap haan karein",
  DRAFT_MESSAGE: "Pehla message likh kar de sakte hain — bhejenge aap khud, badal kar",
};

/** Default life of a grant. Never "forever": an expiry the owner can see is
 *  what makes "help me for a while" different from "take over my profile". */
export const DEFAULT_DELEGATION_DAYS = 90;
export const MAX_DELEGATION_DAYS = 365;

/**
 * The sentence the owner actually agrees to, versioned so a later rewording
 * never rewrites what somebody already consented to.
 */
export const CONSENT_VERSION = 1;

export function consentTextFor(helperLabel: string, permissions: ProfileDelegatePermission[], days: number): string {
  const scopes = permissions.map((p) => PERMISSION_LABELS[p]).join("; ");
  return (
    `Maine ${helperLabel} ko ${days} din ke liye ye permission di: ${scopes}. ` +
    `Ye kabhi bhi meri Profile Access screen se hata sakta/sakti hoon. ` +
    `Ye permission chat, contact number, documents ya private notes tak kabhi nahi jaati.`
  );
}

/* ------------------------------------------------------------------ */
/* Status copy                                                         */
/* ------------------------------------------------------------------ */

/**
 * What the *creator* is told, and nothing more. A partner never learns whether
 * the owner rejected a particular fact — only that the review finished.
 */
export const DRAFT_STATUS_LABEL: Record<ManagedDraftStatus, string> = {
  DRAFT: "Draft",
  INVITED: "Claim link active",
  CLAIMED: "Claimed",
  UNDER_REVIEW: "Waiting for owner review",
  CONFIRMED: "Owner confirmed",
  CANCELLED: "Access revoked",
  EXPIRED: "Expired",
};

export const DRAFT_STATUS_HINT: Record<ManagedDraftStatus, string> = {
  DRAFT: "Abhi sirf aapko dikh raha hai. Claim link banane ke baad hi bheja ja sakta hai.",
  INVITED: "Link bhej diya gaya hai. Jab tak wo khud claim na karein, ye private hai.",
  CLAIMED: "Unhone account se claim kar liya hai. Ab wo details review kar rahe hain.",
  UNDER_REVIEW: "Wo ek-ek detail confirm kar rahe hain. Aapko unka jawaab nahi dikhta.",
  CONFIRMED: "Review poora ho gaya. Profile ab unki hai.",
  CANCELLED: "Ye draft band kar diya gaya hai.",
  EXPIRED: "Claim link expire ho gaya. Naya link bana kar dobara bhej sakte hain.",
};

/** Statuses in which the creator may still edit proposed values. */
export const CREATOR_EDITABLE_STATUSES: readonly ManagedDraftStatus[] = ["DRAFT", "INVITED"];

/** Statuses that still have a live claim path. */
export const CLAIMABLE_STATUSES: readonly ManagedDraftStatus[] = ["DRAFT", "INVITED"];
