import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { getStoredSignalAnswers } from "@/lib/services/profile/intelligenceService";
import { effectiveSignals } from "@/lib/profile/signalAnswers";
import { buildCompatibilityReport, type CompatibilityReport } from "./compatibilityLab";

/**
 * The Compatibility Lab, fetched for one pair.
 *
 * `compatibilityLab.ts` stays pure so the comparison can be tested and reused
 * inside a scoring loop; this is the thin database half, split for the same
 * reason `signalAnswers.ts` and `intelligenceService.ts` are split.
 *
 * The profile page and `dossier.ts` both need the same report, and before this
 * existed only the dossier could produce one — which is why the Lab shipped
 * visible to Grio and invisible on the page it describes. Two call sites
 * building it separately would have been two chances to pass a different
 * `effectiveSignals` and quietly disagree about the same rishta.
 *
 * Null on every state the page already renders as "nothing here": no viewer
 * profile, no candidate, a draft/hidden/deleted candidate, or the viewer
 * looking at themselves.
 */
export async function getCompatibilityReport(
  viewerUserId: string,
  candidateProfileId: string,
): Promise<CompatibilityReport | null> {
  const [viewer, candidate] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: viewerUserId }, include: PROFILE_FULL_INCLUDE }),
    prisma.profile.findUnique({ where: { id: candidateProfileId }, include: PROFILE_FULL_INCLUDE }),
  ]);

  if (!viewer || !candidate) return null;
  if (viewer.userId === candidate.userId) return null;
  if (candidate.deletedAt || !candidate.isVisible || candidate.profileStatus === "DRAFT") return null;

  const [viewerStored, candidateStored] = await Promise.all([
    getStoredSignalAnswers(viewer.id),
    getStoredSignalAnswers(candidate.id),
  ]);

  return buildCompatibilityReport(
    viewer,
    candidate,
    effectiveSignals(viewer, viewerStored),
    effectiveSignals(candidate, candidateStored),
  );
}
