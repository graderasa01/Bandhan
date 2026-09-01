import type {
  PartnerServiceKind,
  ServiceAllocationStatus,
  ServiceBookingStatus,
  ServiceMilestoneStatus,
} from "@prisma/client";

/**
 * The marketplace rulebook — one file, read by the public list, the partner's
 * own service editor, the checkout, the admin console and every route between.
 *
 * No `prisma`, no `server-only`: the same constants have to reach a client
 * component rendering a status chip and a route handler deciding whether a
 * transition is legal. A second copy of either would be a second thing to keep
 * in sync, and the first place that drifts is always the copy the buyer reads.
 */

/* ------------------------------------------------------------------ */
/* The closed service catalog                                          */
/* ------------------------------------------------------------------ */

export interface ServiceKindSpec {
  kind: PartnerServiceKind;
  label: string;
  /** The promise, written by us. A partner may not reword this. */
  promise: string;
  /** What counts as proof the work happened. */
  deliveryProof: string;
  /** Seeded onto a new offer; the partner edits from here. */
  defaultDeliverables: string[];
  defaultDeliveryDays: number;
  /** Guard rails, so a service cannot be priced as a marriage guarantee. */
  minPricePaise: number;
  maxPricePaise: number;
}

/**
 * Six services, fixed in code.
 *
 * The alternative — a free-text service name — was rejected outright. The one
 * rule this marketplace cannot bend is that nothing may promise a marriage
 * (D-61 bans the claim outright), and a partner typing their own product name
 * is exactly how "Guaranteed Rishta in 30 Days" reaches a public page. Here the
 * *promise* is ours and only the price, the scope wording and the deliverables
 * are the partner's.
 *
 * Prices are experiments (the plan says so) and are per-partner within a band.
 * The band exists so a ₹49 loss-leader cannot be used to buy ranking, and a
 * ₹2,00,000 "package" cannot be sold to a family in distress.
 */
export const SERVICE_KINDS: ServiceKindSpec[] = [
  {
    kind: "INTRO_CALL",
    label: "Partner Intro Call",
    promise: "Ek 10–15 minute ki call, jisme wo aapki zaroorat samajhkar aage ka rasta batayenge.",
    deliveryProof: "Call ho gayi — ya paisa wapas.",
    defaultDeliverables: ["10–15 minute ki intro call"],
    defaultDeliveryDays: 3,
    minPricePaise: 9_900,
    maxPricePaise: 99_900,
  },
  {
    kind: "PROFILE_SETUP",
    label: "Profile Setup",
    promise: "Wo aapki profile ka draft tayyar karenge — lagega tabhi jab aap khud confirm karenge.",
    deliveryProof: "Aap draft accept karte hain.",
    defaultDeliverables: ["Poora profile draft", "Aapke review ke liye bheja gaya"],
    defaultDeliveryDays: 5,
    minPricePaise: 29_900,
    maxPricePaise: 2_49_900,
  },
  {
    kind: "CURATED_SHORTLIST",
    label: "Curated Shortlist",
    promise: "Aapki pasand ke hisaab se chuni hui profiles, har ek ke saath wajah.",
    deliveryProof: "Shortlist wajah ke saath deliver hui.",
    defaultDeliverables: ["10 eligible profiles", "Har profile par ek wajah"],
    defaultDeliveryDays: 7,
    minPricePaise: 49_900,
    maxPricePaise: 4_99_900,
  },
  {
    kind: "ASSISTED_SEARCH",
    label: "Assisted Search",
    promise: "30 din ka package — har hafte nayi shortlist aur update.",
    deliveryProof: "Har hafte ka milestone poora hua.",
    defaultDeliverables: ["Hafta 1 — shortlist", "Hafta 2 — shortlist", "Hafta 3 — shortlist", "Hafta 4 — summary"],
    defaultDeliveryDays: 30,
    minPricePaise: 1_49_900,
    maxPricePaise: 9_99_900,
  },
  {
    kind: "FAMILY_COORDINATION",
    label: "Family Coordination",
    promise: "Dono taraf ke ghar walon se baat, availability aur meeting ki taalmel.",
    deliveryProof: "Coordination tasks log hue.",
    defaultDeliverables: ["Dono parivaaron se baat", "Availability tay ki"],
    defaultDeliveryDays: 10,
    minPricePaise: 99_900,
    maxPricePaise: 4_99_900,
  },
  {
    kind: "MEETING_COORDINATION",
    label: "Meeting Coordination",
    promise: "Ek tay rishte ke liye milne ka intezaam.",
    deliveryProof: "Meeting schedule ya ho gayi — record ke saath.",
    defaultDeliverables: ["Meeting tay ki", "Dono taraf confirm hua"],
    defaultDeliveryDays: 14,
    minPricePaise: 49_900,
    maxPricePaise: 2_99_900,
  },
];

export const SERVICE_KIND_BY_KEY: Record<PartnerServiceKind, ServiceKindSpec> = Object.fromEntries(
  SERVICE_KINDS.map((s) => [s.kind, s]),
) as Record<PartnerServiceKind, ServiceKindSpec>;

/**
 * The sentence under every price, everywhere. Not decorative — D-61 bans
 * marriage guarantees, and a marketplace of human services is the single
 * likeliest place for one to creep back in as an implication.
 */
export const NO_GUARANTEE_NOTE =
  "Ye kaam ka vaada hai, shaadi ka nahi. Koi bhi partner shaadi ki guarantee nahi de sakta.";

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export const DEFAULT_PLATFORM_FEE_BPS = 1500;
export const DEFAULT_ACCEPT_SLA_HOURS = 48;
export const DEFAULT_REFUND_WINDOW_DAYS = 3;

/** Whole rupees, rounded down — the partner never sees a paisa they can't be paid. */
export function splitBooking(pricePaise: number, feeBps: number): {
  platformFeePaise: number;
  partnerAmountPaise: number;
} {
  const platformFeePaise = Math.floor((pricePaise * feeBps) / 10_000);
  return { platformFeePaise, partnerAmountPaise: pricePaise - platformFeePaise };
}

export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/* ------------------------------------------------------------------ */
/* Booking lifecycle                                                   */
/* ------------------------------------------------------------------ */

export const BOOKING_STATUS_LABEL: Record<ServiceBookingStatus, string> = {
  PENDING_PAYMENT: "Payment baaki",
  PAID: "Partner ke accept ka intezaar",
  ACCEPTED: "Accept ho gaya",
  IN_PROGRESS: "Kaam chal raha hai",
  DELIVERED: "Deliver ho gaya — aapke confirm ka intezaar",
  COMPLETED: "Poora ho gaya",
  CANCELLED: "Cancel",
  REFUNDED: "Refund ho gaya",
  EXPIRED_UNACCEPTED: "Partner ne time par accept nahi kiya — refund",
  DISPUTED: "Complaint darj — review me hai",
};

export const MILESTONE_STATUS_LABEL: Record<ServiceMilestoneStatus, string> = {
  PENDING: "Baaki",
  SUBMITTED: "Partner ne bheja",
  ACCEPTED: "Aapne accept kiya",
  DISPUTED: "Aapne sawaal uthaya",
};

export const ALLOCATION_STATUS_LABEL: Record<ServiceAllocationStatus, string> = {
  HELD: "Kaam poora hone tak roka gaya",
  RELEASED: "Withdraw ke liye taiyaar",
  PAID: "Bhej diya gaya",
  REVERSED: "Refund ki wajah se wapas",
};

/**
 * Statuses a *buyer or partner* may still unwind themselves.
 *
 * COMPLETED is absent on purpose: once the buyer has acknowledged (or the
 * refund window has closed), neither side gets to reverse it unilaterally.
 */
export const REFUNDABLE_STATUSES: readonly ServiceBookingStatus[] = [
  "PAID",
  "ACCEPTED",
  "IN_PROGRESS",
  "DELIVERED",
  "DISPUTED",
];

/**
 * What an **admin** may refund — the same list plus COMPLETED.
 *
 * A complaint desk that cannot touch a completed booking is not a complaint
 * desk: the most serious cases (work that turned out to be fabricated, a
 * partner who took the money and delivered nothing but ticked every box) are
 * discovered *after* the window closed. This is why `refundBooking` reverses
 * RELEASED allocations as well as HELD ones — without COMPLETED being
 * refundable, that branch would be unreachable code pretending to be a
 * safeguard.
 */
export const ADMIN_REFUNDABLE_STATUSES: readonly ServiceBookingStatus[] = [
  ...REFUNDABLE_STATUSES,
  "COMPLETED",
];

/** Statuses that count as "this partner is currently busy with you". */
export const ACTIVE_BOOKING_STATUSES: readonly ServiceBookingStatus[] = [
  "PAID",
  "ACCEPTED",
  "IN_PROGRESS",
  "DELIVERED",
  "DISPUTED",
];

/** Terminal, and counted in the completion-rate denominator. */
export const SETTLED_BOOKING_STATUSES: readonly ServiceBookingStatus[] = [
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
  "EXPIRED_UNACCEPTED",
];

/**
 * The buyer can cancel for a full refund right up to the moment a partner
 * accepts, and not after.
 *
 * The line is drawn at acceptance rather than at delivery because acceptance is
 * the first point at which the partner has actually given up something — a slot
 * they are now holding. After that the buyer's route is a dispute, which a
 * human reads, not a button that takes the money back.
 */
export function buyerMayCancelFreely(status: ServiceBookingStatus): boolean {
  return status === "PAID";
}

/* ------------------------------------------------------------------ */
/* Contact scrubbing                                                   */
/* ------------------------------------------------------------------ */

/**
 * Strips phone numbers and email addresses out of a pre-booking message.
 *
 * "Raw contact list is never sold" is a Phase 2 acceptance criterion, and it is
 * only true if the *messaging* honours it too — a directory you have to ask for
 * one row at a time is still a directory. So the enquiry thread carries
 * questions and answers, and the moment either side tries to jump off-platform
 * before a booking exists, the digits do not survive the write.
 *
 * Applied at write time, not read time: what is stored is what may be read, so
 * no future change to a renderer can un-redact anything.
 *
 * Deliberately not clever. It catches Indian mobile numbers with or without a
 * country code and separators, plain email addresses, and long digit runs. It
 * will not catch "nau do teen..." spelled out in words, and it is not trying
 * to — the point is to remove the easy path and make the attempt visible
 * (`redacted`), not to win an arms race with a determined user.
 */
const PHONE_RE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\])\s*[A-Za-z0-9.-]+\s*(?:\.|\(dot\))\s*[A-Za-z]{2,}/g;

export function redactContactDetails(text: string): { body: string; redacted: boolean } {
  let redacted = false;
  const body = text
    .replace(EMAIL_RE, () => {
      redacted = true;
      return "[email hata diya gaya]";
    })
    .replace(PHONE_RE, (match) => {
      // A price ("1500") or a year is not a phone number. Count digits rather
      // than length, so "+91 98765 43210" trips it and "₹2,49,900" does not.
      const digits = match.replace(/\D/g, "");
      if (digits.length < 9) return match;
      redacted = true;
      return "[number hata diya gaya]";
    });
  return { body, redacted };
}

export const ENQUIRY_REDACTION_NOTE =
  "Booking se pehle number ya email share nahi hota — baat yahin platform par hoti hai. Ye aap dono ki suraksha ke liye hai.";

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export const MAX_ENQUIRY_MESSAGE_CHARS = 1000;
export const MAX_SCOPE_CHARS = 600;
export const MAX_DELIVERABLES = 8;
export const MAX_DELIVERABLE_CHARS = 120;
export const MAX_HEADLINE_CHARS = 90;
export const MAX_ABOUT_CHARS = 900;
export const MAX_SERVICE_AREAS = 12;
export const MAX_REVIEW_CHARS = 700;

/**
 * The wording above the rating box.
 *
 * Lives here rather than beside `createReview` because the review form is a
 * client component and `reviewService` is `server-only` — importing this from
 * there would drag Prisma into the browser bundle and fail the build. Copy that
 * both sides need is policy, not logic.
 */
export const REVIEW_PROMPT =
  "Jo kaam aapne kharida tha, wo kaisa raha? Rishta hua ya nahi — us par rating nahi hai, aur nahi honi chahiye.";
