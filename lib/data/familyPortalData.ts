import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { getKundliNotes, type KundliNote } from "@/lib/services/kundli/kundliService";

/**
 * What a family session sees: the owner's own matches and shortlist, merged
 * into one list — exactly `08_architecture_and_experience_plan.md` §4's
 * "Dekhega: Matches, shortlist" line, not a separate family-only view of the
 * data. A `GUARDIAN` gets this same list; `permissionsFor()` in
 * `familyService.ts` is what actually hides the actions, not a second query.
 */

export interface FamilyNoteRow {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface FamilyProfileRow {
  profileId: string;
  displayName: string;
  age: number | null;
  city: string | null;
  education: string | null;
  profession: string | null;
  trustScore: number | null;
  photoUrl: string | null;
  photoUnlocked: boolean;
  isMatch: boolean;
  matchId: string | null;
  isShortlisted: boolean;
  /** Only a shortlist row this viewer's own session added can be un-shortlisted by them. */
  shortlistedByMe: boolean;
  kundliNotes: KundliNote[];
  notes: FamilyNoteRow[];
}

const PROFILE_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  dateOfBirth: true,
  currentCity: true,
  trustScore: true,
  education: { select: { highestEducation: true } },
  profession: { select: { jobTitle: true } },
  basicDetails: { select: { gotra: true, manglikStatus: true } },
  photos: { where: { isPrimary: true, deletedAt: null }, take: 1, select: { fileUrl: true, verificationStatus: true } },
} as const;

type ProfileRow = {
  id: string;
  userId: string;
  displayName: string | null;
  dateOfBirth: Date | null;
  currentCity: string | null;
  trustScore: number | null;
  education: { highestEducation: string | null } | null;
  profession: { jobTitle: string | null } | null;
  basicDetails: { gotra: string | null; manglikStatus: string | null } | null;
  photos: { fileUrl: string; verificationStatus: string }[];
};

function baseRow(p: ProfileRow, unlocked: boolean, viewerBasic: { gotra?: string | null; manglikStatus?: string | null }): FamilyProfileRow {
  const photo = p.photos[0];
  return {
    profileId: p.id,
    displayName: p.displayName ?? "Profile",
    age: ageFromDate(p.dateOfBirth),
    city: p.currentCity,
    education: p.education?.highestEducation ?? null,
    profession: p.profession?.jobTitle ?? null,
    trustScore: p.trustScore,
    photoUrl: unlocked ? (photo?.fileUrl ?? null) : null,
    photoUnlocked: unlocked,
    isMatch: false,
    matchId: null,
    isShortlisted: false,
    shortlistedByMe: false,
    kundliNotes: getKundliNotes(viewerBasic, { gotra: p.basicDetails?.gotra, manglikStatus: p.basicDetails?.manglikStatus }),
    notes: [],
  };
}

export async function getFamilyPortalProfiles(
  ownerUserId: string,
  viewerFamilyMemberId: string,
): Promise<FamilyProfileRow[]> {
  const [matches, shortlistRows, ownerProfile] = await Promise.all([
    prisma.match.findMany({
      where: { OR: [{ userAId: ownerUserId }, { userBId: ownerUserId }] },
      include: {
        userA: { select: { profile: { select: PROFILE_SELECT } } },
        userB: { select: { profile: { select: PROFILE_SELECT } } },
      },
    }),
    prisma.shortlist.findMany({
      where: { userId: ownerUserId },
      orderBy: { createdAt: "desc" },
      include: { targetProfile: { select: PROFILE_SELECT } },
    }),
    prisma.profile.findUnique({
      where: { userId: ownerUserId },
      select: { basicDetails: { select: { gotra: true, manglikStatus: true } } },
    }),
  ]);

  const viewerBasic = { gotra: ownerProfile?.basicDetails?.gotra, manglikStatus: ownerProfile?.basicDetails?.manglikStatus };
  const matchedUserIds = new Set(matches.flatMap((m) => [m.userAId, m.userBId]).filter((id) => id !== ownerUserId));

  const rows = new Map<string, FamilyProfileRow>();

  for (const m of matches) {
    const otherProfile = (m.userAId === ownerUserId ? m.userB : m.userA).profile;
    if (!otherProfile) continue;
    const row = baseRow(otherProfile as ProfileRow, true, viewerBasic);
    row.isMatch = true;
    row.matchId = m.id;
    rows.set(row.profileId, row);
  }

  for (const s of shortlistRows) {
    const p = s.targetProfile as ProfileRow;
    const unlocked = matchedUserIds.has(p.userId);
    const existing = rows.get(p.id);
    const row = existing ?? baseRow(p, unlocked, viewerBasic);
    row.isShortlisted = true;
    row.shortlistedByMe = s.addedByFamilyMemberId === viewerFamilyMemberId;
    rows.set(p.id, row);
  }

  if (rows.size === 0) return [];

  const notes = await prisma.familyNote.findMany({
    where: { targetProfileId: { in: [...rows.keys()] }, familyMember: { ownerUserId } },
    orderBy: { createdAt: "asc" },
    include: { familyMember: { select: { displayName: true } } },
  });
  for (const n of notes) {
    rows.get(n.targetProfileId)?.notes.push({
      id: n.id,
      body: n.body,
      authorName: n.familyMember.displayName,
      createdAt: n.createdAt.toISOString(),
    });
  }

  // Matches first (the more decisive signal), then shortlist-only, both newest-relevant first.
  return [...rows.values()].sort((a, b) => Number(b.isMatch) - Number(a.isMatch));
}
