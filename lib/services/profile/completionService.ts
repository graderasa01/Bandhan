import type { Prisma } from "@prisma/client";
import {
  completionPercent,
  fullCompletionPercent,
  missingForFullProfile,
  missingRequired,
  stageProgress,
} from "@/lib/profile/stages";
import { evaluateReadiness, MINIMUM_LIVE_FIELDS } from "@/lib/profile/readiness";
import { profileTablesToDraftValues } from "./fieldMapping";
import type { PROFILE_FULL_INCLUDE } from "./profileInclude";

export type ProfileWithSubTables = Prisma.ProfileGetPayload<{ include: typeof PROFILE_FULL_INCLUDE }>;

/**
 * Values-only completion numbers.
 *
 * Deliberately synchronous and provenance-blind: this is what a dozen callers
 * want (a percentage, a list of gaps, the draft values) and none of them should
 * pay for a provenance query to get it.
 *
 * The one thing it no longer decides is **whether the profile may go live**.
 * That question needs provenance — an unconfirmed AI reading is not an answer —
 * so it belongs to `readinessService.getProfileReadiness`, which is the single
 * authority every gate now reads. `isLive` here remains as the values-only half
 * of that rule and is exactly what it says: "the eight minimum fields hold
 * valid values". It is a *necessary* condition for live, never a sufficient one.
 */
export function computeCompletion(profile: ProfileWithSubTables) {
  const values = profileTablesToDraftValues({
    profile,
    basicDetails: profile.basicDetails,
    education: profile.education,
    profession: profile.profession,
    family: profile.family,
    lifestyle: profile.lifestyle,
    partnerPreferences: profile.partnerPreferences,
  });

  const missing = missingRequired(values);
  const missingFull = missingForFullProfile(values);
  // Same rule the server-authoritative check uses, minus its provenance input.
  const valuesReadiness = evaluateReadiness(values);

  return {
    percent: completionPercent(values),
    missingFields: missing.map((f) => f.label),
    /** Minimum fields present and valid. See the note above: not "live" on its own. */
    isLive: valuesReadiness.ready,
    /** Every required field in every stage — the "complete profile" bar, not the live gate. */
    isFullySubmittable: missing.length === 0,
    draftValues: values,
    // What ProfileGate needs — the eight minimum fields, the actual live gate.
    stage1MissingFields: valuesReadiness.blockers.map((b) => b.label),
    stage1Progress: { done: valuesReadiness.done, total: MINIMUM_LIVE_FIELDS.length },
    // Required + optional, sensitive/photo excluded — Serious Circle's bar.
    fullPercent: fullCompletionPercent(values),
    missingFullFields: missingFull,
    /** Kept for callers that still want raw stage-1 progress by the old name. */
    stageProgress: stageProgress(1, values),
  };
}
