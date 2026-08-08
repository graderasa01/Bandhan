import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AdminMessageAudience, Prisma } from "@prisma/client";

/**
 * Who an admin can address, as a short fixed list.
 *
 * Deliberately not a query builder. A free-form audience filter in an admin
 * panel is one typo away from mailing everybody, and every segment here has to
 * be a sentence someone can read back before pressing send ("FREE plan par
 * hain") rather than a WHERE clause they have to interpret. Adding a segment
 * is a code change, which is the right amount of friction for something that
 * decides who gets a push notification.
 *
 * Every resolver returns **User ids**, including the partner ones — a partner
 * is messaged through their user account, same as anyone else, so the delivery
 * table and the notice inbox stay uniform.
 */

export type SegmentKey =
  | "FREE_PLAN"
  | "PAID_PLAN"
  | "INCOMPLETE_PROFILE"
  | "IDLE_7D"
  | "LAPSED_PLAN"
  | "PARTNERS_ACTIVE"
  | "PARTNERS_PENDING"
  | "PARTNERS_NO_LEADS";

export type SegmentDef = {
  key: SegmentKey;
  audience: AdminMessageAudience;
  label: string;
  blurb: string;
};

export const SEGMENTS: SegmentDef[] = [
  {
    key: "FREE_PLAN",
    audience: "USER",
    label: "FREE plan par hain",
    blurb: "Active members jinke paas abhi koi paid subscription nahi hai.",
  },
  {
    key: "PAID_PLAN",
    audience: "USER",
    label: "Paid plan par hain",
    blurb: "Jinka subscription abhi chal raha hai.",
  },
  {
    key: "INCOMPLETE_PROFILE",
    audience: "USER",
    label: "Profile adhoori hai",
    blurb: "Register to kiya par profile abhi live nahi hui.",
  },
  {
    key: "IDLE_7D",
    audience: "USER",
    label: "7 din se nahi aaye",
    blurb: "Aakhri login 7 din se purana hai (ya kabhi login nahi kiya).",
  },
  {
    key: "LAPSED_PLAN",
    audience: "USER",
    label: "Plan khatam ho gaya",
    blurb: "Pehle paid the, ab koi active subscription nahi.",
  },
  {
    key: "PARTNERS_ACTIVE",
    audience: "PARTNER",
    label: "Approved / active partners",
    blurb: "Jo abhi kaam kar rahe hain.",
  },
  {
    key: "PARTNERS_PENDING",
    audience: "PARTNER",
    label: "Approval ka intezaar",
    blurb: "Application aa chuki hai, faisla baaki hai.",
  },
  {
    key: "PARTNERS_NO_LEADS",
    audience: "PARTNER",
    label: "Approved par ek bhi lead nahi",
    blurb: "Code mil gaya hai lekin abhi tak koi referral nahi aaya.",
  },
];

export function segmentsFor(audience: AdminMessageAudience): SegmentDef[] {
  return SEGMENTS.filter((s) => s.audience === audience);
}

export function isSegmentKey(value: string): value is SegmentKey {
  return SEGMENTS.some((s) => s.key === value);
}

/** Members who can actually be reached — blocked/deleted/suspended accounts are never messaged. */
const REACHABLE_USER: Prisma.UserWhereInput = {
  deletedAt: null,
  status: { in: ["ACTIVE", "INCOMPLETE"] },
};

export async function resolveSegment(key: SegmentKey): Promise<string[]> {
  const now = new Date();

  switch (key) {
    case "FREE_PLAN": {
      const rows = await prisma.user.findMany({
        where: {
          ...REACHABLE_USER,
          role: "USER",
          subscriptions: { none: { status: "ACTIVE", currentPeriodEnd: { gt: now } } },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    case "PAID_PLAN": {
      const rows = await prisma.user.findMany({
        where: {
          ...REACHABLE_USER,
          role: "USER",
          subscriptions: { some: { status: "ACTIVE", currentPeriodEnd: { gt: now } } },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    case "INCOMPLETE_PROFILE": {
      // Mirrors the "profile live" test used everywhere else (the
      // required-fields score at 100), including the never-created-a-profile
      // case, which is the most incomplete of all.
      const rows = await prisma.user.findMany({
        where: {
          ...REACHABLE_USER,
          role: "USER",
          OR: [{ profile: { is: null } }, { profile: { profileCompletionScore: { lt: 100 } } }],
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    case "IDLE_7D": {
      const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const rows = await prisma.user.findMany({
        where: {
          ...REACHABLE_USER,
          role: "USER",
          OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: cutoff } }],
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    case "LAPSED_PLAN": {
      const rows = await prisma.user.findMany({
        where: {
          ...REACHABLE_USER,
          role: "USER",
          // Had one at some point, has none running now.
          subscriptions: { some: {} },
          NOT: { subscriptions: { some: { status: "ACTIVE", currentPeriodEnd: { gt: now } } } },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }

    case "PARTNERS_ACTIVE": {
      const rows = await prisma.partner.findMany({
        where: { status: { in: ["APPROVED", "ACTIVE"] }, user: REACHABLE_USER },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    }

    case "PARTNERS_PENDING": {
      const rows = await prisma.partner.findMany({
        where: { status: "PENDING_APPROVAL", user: REACHABLE_USER },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    }

    case "PARTNERS_NO_LEADS": {
      const rows = await prisma.partner.findMany({
        where: { status: { in: ["APPROVED", "ACTIVE"] }, referrals: { none: {} }, user: REACHABLE_USER },
        select: { userId: true },
      });
      return rows.map((r) => r.userId);
    }
  }
}

/** `target: ALL` — every reachable account in that audience. */
export async function resolveAll(audience: AdminMessageAudience): Promise<string[]> {
  if (audience === "PARTNER") {
    const rows = await prisma.partner.findMany({ where: { user: REACHABLE_USER }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }
  const rows = await prisma.user.findMany({ where: { ...REACHABLE_USER, role: "USER" }, select: { id: true } });
  return rows.map((r) => r.id);
}
