import "server-only";
import { prisma } from "@/lib/db/prisma";
import { REASON_MAX, REASON_MIN } from "@/lib/services/partner/constants";
import { getPlanCatalog, planFeaturesOf } from "@/lib/services/plans/planCatalog";
import { MAX_SLIDES } from "@/lib/services/profile/photoSlides";
import type { ProfilePhoto, Role } from "@prisma/client";

export { REASON_MAX, REASON_MIN };

/**
 * The only place a photo's verification status ever changes.
 *
 * Until this existed, every photo was written as PENDING by
 * `api/profile/photo` and nothing in the codebase could ever move it — so the
 * "verified" badge in the reel, chat list and discovery never rendered for
 * anyone, and `trustScoreService`'s `photoApproved` points were unreachable.
 *
 * A human decides, always. There is no AI on this path and no automatic
 * approval — D-32 puts the decision in code or a person, and "this face looks
 * real" is not something code can rule on.
 */

export type PhotoReviewAction = "approve" | "reject";

const AUDIT_ACTION: Record<PhotoReviewAction, string> = {
  approve: "PHOTO_APPROVED",
  reject: "PHOTO_REJECTED",
};

export type PhotoReviewResult =
  | { ok: true; photo: ProfilePhoto }
  | { ok: false; error: string; message: string; status: number };

export async function reviewPhoto(params: {
  photoId: string;
  action: PhotoReviewAction;
  actorId: string;
  actorRole: Role;
  reason?: string;
}): Promise<PhotoReviewResult> {
  const { photoId, action, actorId, actorRole, reason } = params;

  // Rejection takes something away and the user is shown why, so it is the
  // one action that must carry an explanation — same rule as partner reject.
  if (action === "reject") {
    const trimmed = reason?.trim() ?? "";
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      return {
        ok: false,
        error: "REASON_REQUIRED",
        message: `Reason ${REASON_MIN} se ${REASON_MAX} characters ke beech hona chahiye.`,
        status: 422,
      };
    }
  }

  const photo = await prisma.profilePhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.deletedAt) {
    return { ok: false, error: "NOT_FOUND", message: "Photo nahi mili.", status: 404 };
  }

  if (photo.verificationStatus !== "PENDING") {
    return {
      ok: false,
      error: "ALREADY_REVIEWED",
      message: `Ye photo pehle hi ${photo.verificationStatus} ho chuki hai.`,
      status: 409,
    };
  }

  const now = new Date();
  const nextStatus = action === "approve" ? "APPROVED" : "REJECTED";

  const updated = await prisma.$transaction(async (tx) => {
    // Auto-join the reel deck on approval, up to MAX_SLIDES, so a profile
    // shows the tap-through "reel" the moment it has photos to show one with
    // — not only once the owner discovers the manual toggle in
    // PhotoUploadCard. The owner can still remove any slide afterward
    // (setPhotoInReel); this only picks a sane default instead of leaving
    // every fresh profile stuck on a single static photo.
    let autoSlotOrder: number | undefined;
    if (action === "approve") {
      const currentSlides = await tx.profilePhoto.count({
        where: { profileId: photo.profileId, slotOrder: { not: null }, deletedAt: null },
      });
      autoSlotOrder = currentSlides < MAX_SLIDES ? currentSlides + 1 : undefined;
    }

    const row = await tx.profilePhoto.update({
      where: { id: photoId },
      data: {
        verificationStatus: nextStatus,
        verifiedAt: action === "approve" ? now : null,
        rejectedReason: action === "reject" ? reason?.trim() : null,
        slotOrder: autoSlotOrder,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorId,
        actorRole,
        actionType: AUDIT_ACTION[action],
        targetType: "profile_photo",
        targetId: photoId,
        previousValue: photo.verificationStatus,
        newValue: nextStatus,
        reason: reason?.trim() || null,
      },
    });

    return row;
  });

  // Trust score is recomputed on read (`computeTrustScore`), so approving a
  // photo raises the score without anything here writing to it — no second
  // copy of the scoring rules to keep in sync.
  return { ok: true, photo: updated };
}

export interface PendingPhotoRow {
  id: string;
  fileUrl: string;
  isPrimary: boolean;
  uploadedAt: string;
  profileId: string;
  displayName: string;
  city: string | null;
  profileStatus: string;
  /** Already-decided photos are listed too, so a mistake is visible rather than lost. */
  verificationStatus: string;
  rejectedReason: string | null;
  /** D-11's `priorityVerification` — this photo's owner is on a plan that promises faster review. */
  priority: boolean;
}

const QUEUE_INCLUDE = {
  profile: { select: { id: true, userId: true, displayName: true, currentCity: true, profileStatus: true } },
} as const;

type PhotoWithProfile = ProfilePhoto & {
  profile: { id: string; userId: string; displayName: string | null; currentCity: string | null; profileStatus: string };
};

function toRow(p: PhotoWithProfile, priorityUserIds: Set<string>): PendingPhotoRow {
  return {
    id: p.id,
    fileUrl: p.fileUrl,
    isPrimary: p.isPrimary,
    uploadedAt: p.uploadedAt.toISOString().slice(0, 10),
    profileId: p.profile.id,
    displayName: p.profile.displayName ?? "Profile",
    city: p.profile.currentCity,
    profileStatus: p.profile.profileStatus,
    verificationStatus: p.verificationStatus,
    rejectedReason: p.rejectedReason,
    priority: priorityUserIds.has(p.profile.userId),
  };
}

/**
 * Whose photos jump the queue right now — D-11's `priorityVerification`
 * (PREMIUM only). One extra bounded query rather than a per-row entitlement
 * lookup: this list is small and admin-only, not the L2 scoring hot path
 * `pipeline.ts` has to stay free of DB round-trips in.
 */
async function getPriorityUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const subs = await prisma.subscription.findMany({
    where: {
      userId: { in: userIds },
      status: { in: ["ACTIVE", "CANCELLED"] },
      currentPeriodEnd: { gt: new Date() },
    },
    select: { userId: true, planCode: true },
  });
  // Catalog fetched once, outside the filter — this runs over every active
  // subscriber and a lookup per row would be a query per row.
  const catalog = await getPlanCatalog();
  return new Set(
    subs.filter((s) => planFeaturesOf(catalog, s.planCode).priorityVerification).map((s) => s.userId),
  );
}

/**
 * Two queries rather than one sorted list: `verificationStatus` is a String,
 * so ordering by it puts APPROVED before PENDING alphabetically — the exact
 * opposite of what a review queue needs. Splitting also lets the pending side
 * stay uncapped (it must reach zero) while the decided side stays short.
 *
 * Within `pending`, priority photos sort first — but never ahead of a photo
 * that's already been waiting, within the same priority tier: both groups are
 * still oldest-first internally, so priority means "queue-jump the general
 * line," not "cut every priority photo to the very front regardless of age."
 */
export async function getPhotoReviewQueue(): Promise<{ pending: PendingPhotoRow[]; decided: PendingPhotoRow[] }> {
  const [pendingRaw, decidedRaw] = await Promise.all([
    prisma.profilePhoto.findMany({
      where: { deletedAt: null, verificationStatus: "PENDING" },
      orderBy: { uploadedAt: "asc" }, // oldest first — nobody should wait longest and be seen last
      include: QUEUE_INCLUDE,
    }),
    prisma.profilePhoto.findMany({
      where: { deletedAt: null, verificationStatus: { not: "PENDING" } },
      orderBy: { verifiedAt: { sort: "desc", nulls: "last" } },
      take: 20,
      include: QUEUE_INCLUDE,
    }),
  ]);

  const priorityUserIds = await getPriorityUserIds([...new Set(pendingRaw.map((p) => p.profile.userId))]);

  const pending = pendingRaw
    .map((p) => toRow(p, priorityUserIds))
    // Array.sort is stable in Node/V8, so within each tier the existing
    // uploadedAt-asc order from the query is preserved.
    .sort((a, b) => Number(b.priority) - Number(a.priority));

  return { pending, decided: decidedRaw.map((p) => toRow(p, new Set())) };
}
