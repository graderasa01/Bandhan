import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "./profileInclude";
import { activateIfReady } from "./readinessService";
import { noopT, type Translate } from "@/lib/i18n/translate";

export type SubmitResult =
  | { ok: true; profile: Awaited<ReturnType<typeof prisma.profile.update>> }
  | { ok: false; missingFields: string[] };

/**
 * Make the profile live.
 *
 * The gate is the **minimum** readiness rule (`lib/profile/readiness.ts`): the
 * eight stage-1 fields, each present, valid, and not an unconfirmed AI reading.
 *
 * It used to be `isFullySubmittable` — every required field across every stage,
 * twelve fields rather than eight. That is why the product said "your profile is
 * live" after the eight-field deck while the row stayed INCOMPLETE and every
 * gated page bounced the user: the screen and the server were answering two
 * different questions. Optional and later-stage fields make a profile *better*;
 * they were never what makes it *visible*.
 */
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

  const { view } = await activateIfReady(userId, profile);

  if (!view.readiness.ready) {
    // Labels, and *why* each one is unfinished — "Height" reads as missing when
    // in fact it is filled and waiting to be checked, and the caller can only
    // say the right thing if it is told the difference.
    return {
      ok: false,
      missingFields: view.readiness.blockers.map((b) =>
        b.reason === "unconfirmed"
          ? `${b.label} — ${t("profileServices.submit.needsCheck", "check karna baaki hai")}`
          : b.label,
      ),
    };
  }

  // Already live, or just made live — either way re-read the row so the caller
  // gets the persisted truth rather than the values it hoped were written.
  const updated = await prisma.profile.findUniqueOrThrow({ where: { id: profile.id } });
  return { ok: true, profile: updated };
}
