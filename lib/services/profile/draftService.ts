import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "./profileInclude";
import { mapDraftToProfileTables } from "./fieldMapping";
import { computeCompletion } from "./completionService";

export async function getOrCreateProfile(userId: string) {
  const existing = await prisma.profile.findUnique({
    where: { userId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (existing) return existing;

  return prisma.profile.create({
    data: { userId, profileStatus: "DRAFT" },
    include: PROFILE_FULL_INCLUDE,
  });
}

/**
 * Partial, unvalidated — the interview can call this after every answered
 * field. `submitService` is where required-field validation actually lives.
 */
export async function saveDraft(userId: string, values: Record<string, string>) {
  const profile = await getOrCreateProfile(userId);
  const mapped = mapDraftToProfileTables(values);

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data: {
      ...mapped.profile,
      profileStatus: profile.profileStatus === "DRAFT" ? "INCOMPLETE" : profile.profileStatus,
      basicDetails: { upsert: { create: mapped.basicDetails, update: mapped.basicDetails } },
      education: { upsert: { create: mapped.education, update: mapped.education } },
      profession: { upsert: { create: mapped.profession, update: mapped.profession } },
      family: { upsert: { create: mapped.family, update: mapped.family } },
      lifestyle: { upsert: { create: mapped.lifestyle, update: mapped.lifestyle } },
      partnerPreferences: {
        upsert: { create: mapped.partnerPreferences, update: mapped.partnerPreferences },
      },
    },
    include: PROFILE_FULL_INCLUDE,
  });

  // computeCompletion is otherwise derived fresh on every read, but Circle
  // eligibility, the dashboard teaser, and partner visibility
  // (lib/partner/visibility.ts) all read these as stored columns rather than
  // recomputing on every request — so they have to be kept in sync here or
  // they just sit at their @default(0) forever.
  const { percent, fullPercent } = computeCompletion(updated);
  if (percent === updated.profileCompletionScore && fullPercent === updated.fullProfileCompletionScore) {
    return updated;
  }

  return prisma.profile.update({
    where: { id: profile.id },
    data: { profileCompletionScore: percent, fullProfileCompletionScore: fullPercent },
    include: PROFILE_FULL_INCLUDE,
  });
}
