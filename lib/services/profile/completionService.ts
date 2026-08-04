import type { Prisma } from "@prisma/client";
import {
  completionPercent,
  fullCompletionPercent,
  isProfileLive,
  missingForFullProfile,
  missingRequired,
  stageProgress,
} from "@/lib/profile/stages";
import { profileTablesToDraftValues } from "./fieldMapping";
import type { PROFILE_FULL_INCLUDE } from "./profileInclude";

export type ProfileWithSubTables = Prisma.ProfileGetPayload<{ include: typeof PROFILE_FULL_INCLUDE }>;

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
  return {
    percent: completionPercent(values),
    missingFields: missing.map((f) => f.label),
    isLive: isProfileLive(values),
    isFullySubmittable: missing.length === 0,
    draftValues: values,
    // What ProfileGate needs — stage 1 only, the actual "live" gate.
    stage1MissingFields: missing.filter((f) => f.stage === 1).map((f) => f.label),
    stage1Progress: stageProgress(1, values),
    // Required + optional, sensitive/photo excluded — Serious Circle's bar.
    fullPercent: fullCompletionPercent(values),
    missingFullFields: missingFull,
  };
}
