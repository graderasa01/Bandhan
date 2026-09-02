import type { VerificationKind, VerificationOutcome, VerificationPayer } from "@prisma/client";

/**
 * What each badge means, exactly — the one file the whole phase is built to
 * protect.
 *
 * ## The sentence this catalog exists to keep true
 *
 * > `BandhanTak Verified` never means safe spouse, good character or marriage
 * > guarantee. It names exactly what was checked.
 *
 * Every entry below therefore carries three strings and not one: what the badge
 * is *called*, what was actually *checked* (`scope`), and what it explicitly
 * does **not** mean (`notMeaning`). The third is the load-bearing one. A badge
 * with a name and no limit is read as an endorsement of the person, which is
 * the exact claim this product must never make about a stranger somebody is
 * considering marrying.
 *
 * ## Why this is client-safe
 *
 * The subject's own screen, the other member's screen, the Rishta Room and the
 * admin queue all render these words. Four copies of "what does Identity
 * Checked mean" would drift, and the drift would land on the one screen where
 * somebody is deciding whether to trust a stranger.
 *
 * ## The first three kinds have no rows
 *
 * CONTACT_PHONE, CONTACT_EMAIL and PHOTO are already produced by machinery that
 * exists — OTP and photo review. `verificationBadgeService` reads their real
 * columns and presents them through this same catalog, so the member sees one
 * list with one vocabulary. See the `VerificationKind` model note.
 */

export interface VerificationCatalogEntry {
  kind: VerificationKind;
  /** The badge's own words. Short, and never flattering. */
  label: string;
  /**
   * What was checked, as a full sentence. Frozen onto the check at completion
   * (`VerificationCheck.scopeText`) so a later rewording never rewrites a badge
   * somebody has already been shown.
   */
  scope: string;
  /** The limit, said out loud. Rendered under the badge, not behind a tooltip. */
  notMeaning: string;
  /** Days a completed check stays current. Null: it does not lapse. */
  validityDays: number | null;
  /** Can another member ask the subject for this one? */
  requestable: boolean;
  /** Fee in paise when requested. Zero for the self-serve kinds. */
  feePaise: number;
  /** How the subject gets it when nobody asked them to. Null: only by request. */
  selfServeHref: string | null;
}

/**
 * Order matters — it is the order badges are shown in, cheapest-and-commonest
 * first. A profile with only a verified phone should not have it buried under
 * six greyed-out things it does not have.
 */
export const VERIFICATION_CATALOG: readonly VerificationCatalogEntry[] = [
  {
    kind: "CONTACT_PHONE",
    label: "Mobile verified",
    scope: "Is account ke mobile number par OTP bheja gaya aur sahi daala gaya.",
    notMeaning: "Iska matlab sirf itna hai ki number inke paas hai — inke baare me aur kuch nahi.",
    validityDays: null,
    requestable: false,
    feePaise: 0,
    selfServeHref: "/user/verify-contact",
  },
  {
    kind: "CONTACT_EMAIL",
    label: "Email verified",
    scope: "Is account ki email par OTP bheja gaya aur sahi daala gaya.",
    notMeaning: "Sirf email inki hai — aur kuch nahi.",
    validityDays: null,
    requestable: false,
    feePaise: 0,
    selfServeHref: "/user/verify-contact",
  },
  {
    kind: "PHOTO",
    label: "Photo checked",
    scope: "Profile photo hamari team ne dekhi — asli lagti hai, kisi aur jagah se uthayi hui nahi lagti.",
    notMeaning: "Photo purani ho sakti hai. Ye pehchaan (identity) ka check nahi hai.",
    validityDays: null,
    requestable: false,
    feePaise: 0,
    selfServeHref: "/user/profile/me",
  },
  {
    kind: "IDENTITY",
    label: "Pehchaan checked",
    scope:
      "Sarkari ID dekh kar naam aur janm-tareekh profile se milayi gayi. ID ki copy app me kabhi save nahi ki jaati.",
    notMeaning: "Ye character certificate nahi hai. Naam sahi hona aur insaan sahi hona alag baatein hain.",
    validityDays: 365,
    requestable: true,
    feePaise: 19900,
    selfServeHref: null,
  },
  {
    kind: "EDUCATION",
    label: "Padhai checked",
    scope: "Jo degree profile me likhi hai, wo degree aur sansthan dekh kar milaya gaya.",
    notMeaning: "Sirf degree ki baat hai — naukri, salary ya kaam ke baare me kuch nahi.",
    validityDays: 1825,
    requestable: true,
    feePaise: 24900,
    selfServeHref: null,
  },
  {
    kind: "EMPLOYMENT",
    label: "Kaam checked",
    scope: "Jo kaam aur company profile me likhi hai, wo us tareekh tak chalti hui payi gayi.",
    notMeaning: "Salary check nahi hui. Naukri badal bhi sakti hai — isiliye ye check 6 mahine me purana ho jaata hai.",
    validityDays: 180,
    requestable: true,
    feePaise: 24900,
    selfServeHref: null,
  },
  {
    kind: "MARRIAGE_INTENT",
    label: "Shaadi ka iraada confirmed",
    scope:
      "Inse baat karke confirm kiya gaya ki ye khud shaadi ke liye dhoondh rahe hain, aur abhi kisi shaadi ya sagai me nahi hain.",
    notMeaning: "Ye unhone kaha aur hamne pucha — iska matlab ye nahi ki wo kal nahi badlenge.",
    validityDays: 180,
    requestable: true,
    feePaise: 14900,
    selfServeHref: null,
  },
  {
    kind: "HUMAN_INTERVIEW",
    label: "Interview hua",
    scope: "Hamari team ne video par inse baat ki — profile ki baatein inhone khud dohrayi.",
    notMeaning:
      "Ye hamari raay nahi hai ki ye aapke liye sahi hain. Baat hui, aur jo bataya wo profile se mel khata tha — bas.",
    validityDays: 365,
    requestable: true,
    feePaise: 49900,
    selfServeHref: null,
  },
];

const BY_KIND = new Map(VERIFICATION_CATALOG.map((e) => [e.kind, e]));

export function catalogFor(kind: VerificationKind): VerificationCatalogEntry {
  const entry = BY_KIND.get(kind);
  // Unreachable while the enum and this list agree, and a thrown error is the
  // right answer if they ever stop: a badge with no scope sentence is precisely
  // the thing this file exists to prevent from rendering.
  if (!entry) throw new Error(`verificationCatalog: no entry for ${kind}`);
  return entry;
}

export const REQUESTABLE_KINDS: readonly VerificationKind[] = VERIFICATION_CATALOG.filter(
  (e) => e.requestable,
).map((e) => e.kind);

export function isRequestable(kind: VerificationKind): boolean {
  return (REQUESTABLE_KINDS as readonly string[]).includes(kind);
}

/* ------------------------------------------------------------------ */
/* The disclosure line                                                 */
/* ------------------------------------------------------------------ */

/**
 * The five states a member may be told about, assembled rather than stored.
 *
 * Only three of these are conclusions a checker reaches — see the
 * `VerificationOutcome` model note. `DECLINED` belongs to a request that never
 * became a check, and `EXPIRED` is arithmetic on one that did. Keeping the
 * assembly here means the five lines are worded once.
 */
export type BadgeState = "MATCHED" | "MISMATCH" | "COULD_NOT_COMPLETE" | "DECLINED" | "EXPIRED" | "NOT_CHECKED";

export const BADGE_STATE_LINE: Record<BadgeState, string> = {
  MATCHED: "Check hua aur mel khaya",
  MISMATCH: "Check hua, ek farq mila jis par baat karni chahiye",
  COULD_NOT_COMPLETE: "Check poora nahi ho paya",
  DECLINED: "Profile owner ne mana kiya",
  EXPIRED: "Purana ho gaya — dobara karwana hoga",
  NOT_CHECKED: "Abhi check nahi hua",
};

/**
 * A mismatch is not an accusation and the UI must not paint it like one, so
 * tone is part of the contract rather than a per-screen choice.
 */
export const BADGE_STATE_TONE: Record<BadgeState, "good" | "warn" | "neutral"> = {
  MATCHED: "good",
  MISMATCH: "warn",
  COULD_NOT_COMPLETE: "neutral",
  DECLINED: "neutral",
  EXPIRED: "neutral",
  NOT_CHECKED: "neutral",
};

/** Expiry is a date comparison, deliberately not a stored flag that could go stale. */
export function badgeStateFor(
  check: { outcome: VerificationOutcome | null; expiresAt: Date | string | null } | null,
  now: Date = new Date(),
): BadgeState {
  if (!check || !check.outcome) return "NOT_CHECKED";
  if (check.expiresAt && new Date(check.expiresAt).getTime() <= now.getTime()) return "EXPIRED";
  return check.outcome;
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/** The two shares, always summing to the fee. Odd paise land on the requester. */
export function splitFee(feePaise: number, payer: VerificationPayer): { requesterPaise: number; subjectPaise: number } {
  if (payer === "REQUESTER") return { requesterPaise: feePaise, subjectPaise: 0 };
  if (payer === "SUBJECT") return { requesterPaise: 0, subjectPaise: feePaise };
  const subjectPaise = Math.floor(feePaise / 2);
  return { requesterPaise: feePaise - subjectPaise, subjectPaise };
}

export const PAYER_LABEL: Record<VerificationPayer, string> = {
  REQUESTER: "Main bharunga/bharungi",
  SUBJECT: "Wo khud bharein",
  SPLIT: "Aadha-aadha",
};

/**
 * Under every request form and every badge list.
 *
 * The same anti-dark-pattern reflex as `PROPOSAL_DISCLOSURE` and the pricing
 * rules in D-61: the limit is stated where the decision is made, not in a help
 * page nobody opens.
 */
export const VERIFICATION_DISCLOSURE =
  "Paisa dene se jawaab nahi badalta. Check ka nateeja wahi hoga jo mila — aur har badge ke saath likha hota hai ki kya check hua tha aur kab.";

/** How long an unanswered request stays alive. */
export const REQUEST_EXPIRY_DAYS = 14;
export const MAX_REQUEST_MESSAGE_CHARS = 400;
export const MAX_DECLINE_REASON_CHARS = 200;
export const MAX_RESULT_NOTE_CHARS = 300;
export const MAX_EVIDENCE_NOTE_CHARS = 2000;
