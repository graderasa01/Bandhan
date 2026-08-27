import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { getVerificationStatus } from "@/lib/services/verification/contactVerification/contactVerificationService";
import {
  COMPLAINT_LOOKBACK_DAYS,
  MIN_PROFILE_COMPLETION,
  MIN_TRUST_SCORE,
} from "./spotlightPolicy";

/**
 * Who is allowed to pay for visibility.
 *
 * One function, called from three places that must never disagree: the buy
 * screen (which shows the unmet requirements as a to-do list), the checkout
 * (which refuses), and the periodic re-check that pauses a running campaign.
 * The pitch only gated the purchase; that is not enough. A profile that
 * clears the bar on Monday and collects a complaint on Wednesday is still
 * being pushed into strangers' decks on Thursday unless something re-asks.
 *
 * ## Every "no" carries the way out
 *
 * Each requirement returns its own `fixHref`. A greyed-out Buy button with a
 * generic "you are not eligible" is the version of this screen that generates
 * support messages instead of finished profiles.
 *
 * ## What is deliberately *not* required
 *
 * Both phone and email verified — the pitch asked for it, and it would today
 * block essentially everyone: there is no SMS provider configured, so phone
 * verification is not a bar members can actually clear. One verified channel,
 * on top of completion, trust score, a photo and a clean complaint record, is
 * a real gate rather than a decorative one. Revisit when Twilio is live.
 */

export interface EligibilityRequirement {
  key: string;
  /** What is required, in the second person. */
  label: string;
  met: boolean;
  /** Where to go and fix it. Omitted when there is nothing to click. */
  fixHref?: string;
  /** The current value, when seeing it is what makes the requirement actionable. */
  detail?: string;
}

export interface CampaignEligibility {
  eligible: boolean;
  requirements: EligibilityRequirement[];
  /** First unmet requirement, for a one-line summary. Null when eligible. */
  firstBlocker: EligibilityRequirement | null;
}

/** Profile states in which someone is actually being shown to other members. */
const LIVE_PROFILE_STATUSES = ["SUBMITTED", "VERIFIED"] as const;

export async function checkCampaignEligibility(userId: string): Promise<CampaignEligibility> {
  const since = new Date(Date.now() - COMPLAINT_LOOKBACK_DAYS * 86_400_000);

  const [user, profile, contact, complaints] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
    prisma.profile.findUnique({
      where: { userId },
      select: {
        id: true,
        profileStatus: true,
        isVisible: true,
        fullProfileCompletionScore: true,
        trustScore: true,
        gender: true,
        dateOfBirth: true,
        currentCity: true,
        partnerPreferences: { select: { lookingForGender: true, minAge: true, maxAge: true } },
        photos: {
          where: { deletedAt: null, verificationStatus: { not: "REJECTED" } },
          select: { id: true },
          take: 1,
        },
      },
    }),
    getVerificationStatus(userId),
    prisma.contentReport.count({
      where: { reportedUserId: userId, status: { in: ["OPEN", "ACTIONED"] }, createdAt: { gte: since } },
    }),
  ]);

  const prefs = profile?.partnerPreferences ?? null;

  const requirements: EligibilityRequirement[] = [
    {
      key: "account",
      label: "Account active ho",
      met: user?.status === "ACTIVE",
      detail: user && user.status !== "ACTIVE" ? `Abhi: ${user.status}` : undefined,
    },
    {
      key: "profileLive",
      label: "Profile live ho — doosre log use dekh sakein",
      met: Boolean(
        profile &&
          profile.isVisible &&
          (LIVE_PROFILE_STATUSES as readonly string[]).includes(profile.profileStatus),
      ),
      fixHref: "/user/profile",
    },
    {
      key: "completion",
      label: `Profile kam se kam ${MIN_PROFILE_COMPLETION}% poori ho`,
      met: (profile?.fullProfileCompletionScore ?? 0) >= MIN_PROFILE_COMPLETION,
      fixHref: "/user/profile",
      detail: profile ? `Abhi ${profile.fullProfileCompletionScore}%` : undefined,
    },
    {
      key: "trust",
      label: `Trust score kam se kam ${MIN_TRUST_SCORE} ho`,
      met: (profile?.trustScore ?? 0) >= MIN_TRUST_SCORE,
      fixHref: "/user/profile-trust-score",
      detail: profile?.trustScore != null ? `Abhi ${profile.trustScore}` : "Abhi bana nahi",
    },
    {
      key: "contact",
      label: "Phone ya email verified ho",
      met: contact.phone.verified || contact.email.verified,
      fixHref: "/user/verify-contact",
    },
    {
      key: "photo",
      label: "Kam se kam ek photo ho",
      met: (profile?.photos.length ?? 0) > 0,
      fixHref: "/user/profile",
    },
    {
      // Without this the campaign has nothing to intersect against — the
      // two-way filter needs the buyer's own preferences to decide whom they
      // may be shown to. It is also the honest half of the promise: someone
      // who has not said what they want cannot claim a poor match was unfair.
      key: "partnerPrefs",
      label: "Apni partner preferences bhari ho (kise dhoondh rahe hain, umar)",
      met: Boolean(prefs?.lookingForGender && prefs.minAge != null && prefs.maxAge != null),
      fixHref: "/user/profile",
    },
    {
      key: "ownDetails",
      label: "Apni umar aur city profile me ho",
      met: Boolean(profile?.dateOfBirth && profile.currentCity && profile.gender),
      fixHref: "/user/profile",
    },
    {
      key: "noComplaints",
      label: `Pichle ${COMPLAINT_LOOKBACK_DAYS} din me koi safety complaint na ho`,
      met: complaints === 0,
      detail: complaints > 0 ? `${complaints} complaint` : undefined,
    },
  ];

  const firstBlocker = requirements.find((r) => !r.met) ?? null;
  return { eligible: firstBlocker === null, requirements, firstBlocker };
}

/**
 * The advertiser's own facts, loaded once, for the audience query.
 *
 * Separate from the eligibility check because the delivery selector will need
 * these on every run and does not want to re-derive nine requirements to get
 * three columns.
 */
export interface AdvertiserFacts {
  userId: string;
  profileId: string;
  gender: string;
  age: number;
  city: string | null;
}

export async function loadAdvertiserFacts(userId: string): Promise<AdvertiserFacts | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, gender: true, dateOfBirth: true, currentCity: true },
  });
  if (!profile?.gender || !profile.dateOfBirth) return null;

  const age = ageFromDate(profile.dateOfBirth);
  if (age === null) return null;

  return {
    userId,
    profileId: profile.id,
    gender: profile.gender,
    age,
    city: profile.currentCity,
  };
}
