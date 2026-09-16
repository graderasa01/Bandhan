import "server-only";
import type { PhotoPrivacy } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { PhotoLock } from "@/lib/contracts/photoLock";
import { getPlanContext } from "./entitlements";

/**
 * Who may see a candidate's photo without a mutual match — the one rule.
 *
 * The photo gate is read at eight places (reel, shortlist, profile page,
 * family portal, Circle, search, the rishta board and the Rishta Room) and
 * every one of them used to spell the rule out itself. A gate that disagrees
 * with itself leaks exactly where it is weakest, so the rule lives here, once,
 * and each site asks rather than re-derives.
 *
 * ## The rule, and how it got here
 *
 *   • Originally: only a real mutual match opened a photo.
 *   • 2026-08-07: any paid plan opened every photo (`photoUnlockAll`).
 *   • 2026-09-15, D-90 — Devesh's choice, "apni photo lagao, sabki dekho":
 *     a member whose own profile is live and who has an approved photo of
 *     their own sees the photos of members who allow it. No payment involved.
 *     An owner may keep their photo to matches only (`Profile.photoPrivacy`).
 *
 * Why a contribution and not a payment: a face is the first thing anybody
 * needs to decide whether a profile is real, and charging for it is the most
 * "bekar" a price can feel. Asking for your own photo instead keeps empty and
 * throwaway accounts — the ones that collect faces — out, which a price never
 * did.
 *
 * Deliberately NOT a general "can see private fields" check. Caste, gotra,
 * manglik and income are still L3-only regardless of plan — this answers one
 * question about one field, which is why it is named after that field.
 */
export async function canViewerUnlockPhotos(viewerUserId: string): Promise<boolean> {
  const [ctx, viewer] = await Promise.all([
    getPlanContext(viewerUserId),
    prisma.profile.findUnique({
      where: { userId: viewerUserId },
      select: {
        isVisible: true,
        profileStatus: true,
        deletedAt: true,
        photos: {
          where: { deletedAt: null, verificationStatus: "APPROVED" },
          take: 1,
          select: { id: true },
        },
      },
    }),
  ]);

  // A member still inside a month bought on a legacy tier keeps what they paid
  // for until it ends. Nothing sold today sets this.
  if (ctx.features.photoUnlockAll) return true;

  return Boolean(
    viewer &&
      viewer.isVisible &&
      viewer.profileStatus !== "DRAFT" &&
      !viewer.deletedAt &&
      viewer.photos.length > 0,
  );
}

type PhotoGateInput = {
  matched: boolean;
  viewerCanUnlockAll: boolean;
  /**
   * Required, not defaulted: a call site that forgot to load it would otherwise
   * quietly open a MATCH_ONLY photo, and the compiler is the cheapest place to
   * stop that.
   */
  ownerPhotoPrivacy: PhotoPrivacy;
};

/**
 * The full rule for one candidate, with its reason.
 *
 * The owner's choice wins over everything except a real match — including a
 * legacy paid plan. The reason is what lets a card tell the truth: "add your
 * photo" is only offered when adding it would actually open this photo.
 *
 * Takes the already-computed match boolean rather than querying, because
 * every call site has just loaded that set for its own reasons and a second
 * lookup here would double the queries on the reel's hot path.
 */
export function photoLockFor(params: PhotoGateInput): PhotoLock {
  if (params.matched) return "open";
  if (params.ownerPhotoPrivacy === "MATCH_ONLY") return "match_only";
  return params.viewerCanUnlockAll ? "open" : "add_own_photo";
}

/** `photoLockFor(...) === "open"`, for the call sites that only need the gate. */
export function photoUnlockedFor(params: PhotoGateInput): boolean {
  return photoLockFor(params) === "open";
}
