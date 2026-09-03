import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "./profileInclude";
import { computeCompletion } from "./completionService";
import { noopT, type Translate } from "@/lib/i18n/translate";
import { syncJoinerQualification } from "@/lib/services/referral/memberReferralService";

export type SubmitResult =
  | { ok: true; profile: Awaited<ReturnType<typeof prisma.profile.update>> }
  | { ok: false; missingFields: string[] };

/** M03C: validates required fields, sets SUBMITTED, makes the profile visible. */
export async function submitProfile(userId: string, t: Translate = noopT): Promise<SubmitResult> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: PROFILE_FULL_INCLUDE,
  });
  if (!profile) {
    return {
      ok: false,
      missingFields: [t("profileServices.submit.notStarted", "Profile abhi shuru nahi hui hai.")],
    };
  }

  const { missingFields, isFullySubmittable } = computeCompletion(profile);
  if (!isFullySubmittable) return { ok: false, missingFields };

  const updated = await prisma.profile.update({
    where: { id: profile.id },
    data: { profileStatus: "SUBMITTED", submittedAt: new Date(), isVisible: true },
  });

  await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });

  // Going live is one of the two moments a member referral can become
  // qualified. Swallows its own errors: a referral is a bonus on top of a
  // submission that has already committed, and must never be able to undo it.
  await syncJoinerQualification(userId);

  return { ok: true, profile: updated };
}
