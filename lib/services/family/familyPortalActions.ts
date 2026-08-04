import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getProfileView } from "@/lib/data/profileViewData";
import { permissionsFor } from "@/lib/services/family/familyService";
import type { FamilyMember } from "@prisma/client";
import type { ProfileViewModel } from "@/lib/contracts/profileView";

/**
 * The mutating half of the family portal. Every function takes the acting
 * `FamilyMember` row (not just an id) so the permission check reads directly
 * off `relation` — a guardian calling the shortlist endpoint is rejected here
 * even if a future UI bug ever showed them the button.
 */

export type FamilyActionResult = { ok: true } | { ok: false; error: string; message: string; status: number };

/** True only for a profile the owner already has some relationship with — the family view's one authorization boundary. */
async function isInFamilyScope(ownerUserId: string, profileId: string): Promise<{ inScope: boolean; targetUserId: string | null }> {
  const target = await prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
  if (!target) return { inScope: false, targetUserId: null };

  const [match, shortlisted] = await Promise.all([
    prisma.match.findFirst({
      where: {
        OR: [
          { userAId: ownerUserId, userBId: target.userId },
          { userAId: target.userId, userBId: ownerUserId },
        ],
      },
      select: { id: true },
    }),
    prisma.shortlist.findUnique({
      where: { userId_targetProfileId: { userId: ownerUserId, targetProfileId: profileId } },
      select: { id: true },
    }),
  ]);

  return { inScope: Boolean(match || shortlisted), targetUserId: target.userId };
}

export async function addFamilyShortlist(member: FamilyMember, profileId: string): Promise<FamilyActionResult> {
  if (!permissionsFor(member.relation).canManageShortlist) {
    return { ok: false, error: "FORBIDDEN", message: "Ye action aapki role ke liye available nahi hai.", status: 403 };
  }

  // A family session only ever adds someone already surfaced by the owner's
  // own matches — never an arbitrary profile id it happens to guess.
  const target = await prisma.profile.findUnique({ where: { id: profileId }, select: { userId: true } });
  if (!target) return { ok: false, error: "NOT_FOUND", message: "Profile nahi mila.", status: 404 };

  const isOwnersMatch = await prisma.match.findFirst({
    where: {
      OR: [
        { userAId: member.ownerUserId, userBId: target.userId },
        { userAId: target.userId, userBId: member.ownerUserId },
      ],
    },
    select: { id: true },
  });
  if (!isOwnersMatch) {
    return { ok: false, error: "NOT_A_MATCH", message: "Sirf matches me se shortlist ki ja sakti hai.", status: 403 };
  }

  await prisma.shortlist.upsert({
    where: { userId_targetProfileId: { userId: member.ownerUserId, targetProfileId: profileId } },
    create: { userId: member.ownerUserId, targetProfileId: profileId, addedByFamilyMemberId: member.id },
    update: {}, // already shortlisted (by owner or another family member) — leave attribution as-is
  });
  return { ok: true };
}

export async function removeFamilyShortlist(member: FamilyMember, profileId: string): Promise<FamilyActionResult> {
  // Scoped to rows *this* session added — a family member can't undo the
  // owner's own curation or another family member's.
  const deleted = await prisma.shortlist.deleteMany({
    where: { userId: member.ownerUserId, targetProfileId: profileId, addedByFamilyMemberId: member.id },
  });
  if (deleted.count === 0) {
    return { ok: false, error: "NOT_FOUND", message: "Ye aapki shortlist ki hui entry nahi hai.", status: 404 };
  }
  return { ok: true };
}

export async function addFamilyNote(member: FamilyMember, profileId: string, body: string): Promise<FamilyActionResult> {
  if (!permissionsFor(member.relation).canWriteNotes) {
    return { ok: false, error: "FORBIDDEN", message: "Ye action aapki role ke liye available nahi hai.", status: 403 };
  }
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 500) {
    return { ok: false, error: "VALIDATION_FAILED", message: "Note 1 se 500 characters ke beech hona chahiye.", status: 422 };
  }

  const { inScope } = await isInFamilyScope(member.ownerUserId, profileId);
  if (!inScope) return { ok: false, error: "NOT_FOUND", message: "Profile nahi mila.", status: 404 };

  await prisma.familyNote.create({ data: { familyMemberId: member.id, targetProfileId: profileId, body: trimmed } });
  return { ok: true };
}

export type ProfileDetailResult =
  | { ok: true; profile: ProfileViewModel }
  | { ok: false; error: string; message: string; status: number };

export async function getFamilyProfileDetail(member: FamilyMember, profileId: string): Promise<ProfileDetailResult> {
  if (!permissionsFor(member.relation).canViewProfileDetail) {
    return { ok: false, error: "FORBIDDEN", message: "Ye action aapki role ke liye available nahi hai.", status: 403 };
  }

  const { inScope } = await isInFamilyScope(member.ownerUserId, profileId);
  if (!inScope) return { ok: false, error: "NOT_FOUND", message: "Profile nahi mila.", status: 404 };

  // The level the *owner* has earned with this profile (L1/L2/L3) — a family
  // session sees exactly what the owner sees, never more.
  const profile = await getProfileView(member.ownerUserId, profileId);
  if (!profile) return { ok: false, error: "NOT_FOUND", message: "Profile nahi mila.", status: 404 };

  return { ok: true, profile };
}
