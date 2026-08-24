import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { canViewerUnlockPhotos, photoUnlockedFor } from "@/lib/services/plans/photoAccess";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";

/**
 * Advanced Discovery search — the deterministic, server-side-filtered half of
 * `/user/discover`. Deliberately **not** the ranking pipeline
 * (`lib/services/match/pipeline.ts`): a search is "show me people matching
 * these exact filters, newest first", not a scored/personalised deck, so it
 * never touches D-33's weights and never runs `scoreCandidates`.
 *
 * ## The privacy rule this file exists to hold
 *
 * Every filterable field below is one already shown to any viewer at L1
 * (`candidateFacts.ts` — age, city, education, marital status, profession
 * category, diet/smoking/drinking). There is **no** filter for caste, gotra,
 * manglik, income or religion: not hidden by a runtime check, simply absent
 * from `DiscoverySearchParams` and from the Prisma `where` this file builds.
 * A field that never became a query parameter cannot be searched on, which is
 * the same "the catalog is the boundary" argument `lib/contracts/grio.ts`
 * makes for its action list — a filter nobody wrote is safer than a filter
 * guarded by a rule someone has to remember to enforce.
 *
 * ## Visibility
 *
 * A fresh search result has, by definition, no prior interest/match with the
 * viewer in the overwhelming majority of cases, so it is L1 — and every field
 * this file returns is already an L1 field. The one thing that still needs a
 * per-row visibility check is the photo, because `photoUnlockAll` (a
 * different, unrelated plan capability) can open it early; that check is
 * batched below the same way `getShortlist` batches it, not run per-row.
 */

export interface DiscoverySearchFilters {
  nameQuery: string | null;
  minAge: number | null;
  maxAge: number | null;
  cities: string[];
  education: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  diet: string | null;
  smoking: string | null;
  drinking: string | null;
  verifiedOnly: boolean;
  minTrustScore: number | null;
  cursor: string | null;
  pageSize: number;
}

export interface DiscoverySearchResult {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  professionCategory: string | null;
  maritalStatus: string | null;
  trustScore: number | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  photoVerified: boolean;
}

export interface DiscoverySearchPage {
  results: DiscoverySearchResult[];
  nextCursor: string | null;
}

export const DISCOVERY_MAX_PAGE_SIZE = 20;

function ageBoundsToDobRange(minAge: number | null, maxAge: number | null) {
  const now = new Date();
  const maxDob = minAge != null ? new Date(now.getFullYear() - minAge, now.getMonth(), now.getDate()) : undefined;
  const minDob = maxAge != null ? new Date(now.getFullYear() - maxAge - 1, now.getMonth(), now.getDate() + 1) : undefined;
  return { minDob, maxDob };
}

export async function searchDiscoveryCandidates(
  viewerUserId: string,
  filters: DiscoverySearchFilters,
): Promise<DiscoverySearchPage> {
  const [viewer, blockedUserIds, canUnlockAll] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: viewerUserId }, select: { userId: true, partnerPreferences: { select: { lookingForGender: true } } } }),
    getBlockedUserIds(viewerUserId),
    canViewerUnlockPhotos(viewerUserId),
  ]);
  if (!viewer) return { results: [], nextCursor: null };

  const { minDob, maxDob } = ageBoundsToDobRange(filters.minAge, filters.maxAge);
  const pageSize = Math.min(filters.pageSize, DISCOVERY_MAX_PAGE_SIZE);

  const rows = await prisma.profile.findMany({
    where: {
      userId: { not: viewerUserId, notIn: blockedUserIds },
      isVisible: true,
      profileStatus: filters.verifiedOnly ? "VERIFIED" : { in: ["SUBMITTED", "VERIFIED"] },
      deletedAt: null,
      ...(viewer.partnerPreferences?.lookingForGender ? { gender: viewer.partnerPreferences.lookingForGender } : {}),
      ...(filters.nameQuery ? { displayName: { contains: filters.nameQuery, mode: "insensitive" } } : {}),
      ...(minDob || maxDob ? { dateOfBirth: { gte: minDob, lte: maxDob } } : {}),
      ...(filters.cities.length > 0 ? { currentCity: { in: filters.cities } } : {}),
      ...(filters.maritalStatus ? { maritalStatus: filters.maritalStatus } : {}),
      ...(filters.minTrustScore != null ? { trustScore: { gte: filters.minTrustScore } } : {}),
      ...(filters.education ? { education: { highestEducation: filters.education } } : {}),
      ...(filters.professionCategory ? { profession: { professionCategory: filters.professionCategory } } : {}),
      ...(filters.diet || filters.smoking || filters.drinking
        ? {
            lifestyle: {
              ...(filters.diet ? { diet: filters.diet } : {}),
              ...(filters.smoking ? { smoking: filters.smoking } : {}),
              ...(filters.drinking ? { drinking: filters.drinking } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      displayName: true,
      dateOfBirth: true,
      currentCity: true,
      maritalStatus: true,
      trustScore: true,
      education: { select: { highestEducation: true } },
      profession: { select: { professionCategory: true } },
      photos: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { fileUrl: true, verificationStatus: true } },
    },
  });

  const hasMore = rows.length > pageSize;
  const page = hasMore ? rows.slice(0, pageSize) : rows;

  const candidateUserIds = page.map((p) => p.userId);
  const matches =
    candidateUserIds.length > 0
      ? await prisma.match.findMany({
          where: {
            OR: [
              { userAId: viewerUserId, userBId: { in: candidateUserIds } },
              { userBId: viewerUserId, userAId: { in: candidateUserIds } },
            ],
          },
          select: { userAId: true, userBId: true },
        })
      : [];
  const matchedUserIds = new Set(matches.flatMap((m) => [m.userAId, m.userBId]).filter((id) => id !== viewerUserId));

  const results: DiscoverySearchResult[] = page.map((p) => {
    const photo = p.photos[0];
    const photoOpen = photoUnlockedFor({ matched: matchedUserIds.has(p.userId), viewerCanUnlockAll: canUnlockAll });
    return {
      profileId: p.id,
      displayName: p.displayName ?? "Profile",
      age: ageFromDate(p.dateOfBirth),
      city: p.currentCity,
      education: p.education?.highestEducation ?? null,
      professionCategory: p.profession?.professionCategory ?? null,
      maritalStatus: p.maritalStatus,
      trustScore: p.trustScore,
      photoUrl: photoOpen ? (photo?.fileUrl ?? null) : null,
      photoUnlocked: photoOpen,
      photoVerified: photo?.verificationStatus === "APPROVED",
    };
  });

  return { results, nextCursor: hasMore ? page[page.length - 1].id : null };
}
