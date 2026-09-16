import type { Translate } from "@/lib/i18n/translate";

/**
 * Why a candidate's photo is not showing — client-safe, so every card can say
 * the true reason instead of one sentence that is wrong half the time (D-90).
 *
 *   open          — the photo may be shown (the owner may still simply not have
 *                   uploaded one; that is the card's own "no photo yet" line).
 *   add_own_photo — the viewer has no live profile with an approved photo yet.
 *                   Adding theirs is the whole way in, so the card offers it.
 *   match_only    — the owner keeps their photo to matches. Nothing the viewer
 *                   does before a match changes that, so the card offers nothing.
 *
 * Decided on the server by `photoLockFor()` in lib/services/plans/photoAccess.ts.
 */
export type PhotoLock = "open" | "add_own_photo" | "match_only";

/** The one sentence under a locked photo, in the same words on every surface. */
export function photoLockLine(lock: PhotoLock, t: Translate): string | null {
  if (lock === "add_own_photo") {
    return t("photo.lock.addOwnPhoto", "Apni photo lagayein — phir sabki photo dikhegi");
  }
  if (lock === "match_only") {
    return t("photo.lock.matchOnly", "Photo mutual match hone par dikhegi");
  }
  return null;
}
