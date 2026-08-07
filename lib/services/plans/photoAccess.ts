import "server-only";
import { getPlanContext } from "./entitlements";

/**
 * Can this viewer see candidate photos without a mutual match?
 *
 * The photo gate is read at five separate places (reel, shortlist, profile
 * page, family portal, Circle) and every one of them used to spell the rule
 * out itself — "unlocked only when a Match exists". Now that a plan can also
 * open it, that is five chances for the two conditions to drift apart, and a
 * gate that disagrees with itself leaks exactly where it is weakest. So the
 * rule lives here, once, and each site asks rather than re-derives.
 *
 * Deliberately NOT a general "can see private fields" check. Caste, gotra,
 * manglik and income are still L3-only regardless of plan — this answers one
 * question about one field, which is why it is named after that field.
 */
export async function canViewerUnlockPhotos(viewerUserId: string): Promise<boolean> {
  const ctx = await getPlanContext(viewerUserId);
  return ctx.features.photoUnlockAll;
}

/**
 * The full rule for one candidate: open if the pair actually matched, or if
 * the viewer's plan opens every photo.
 *
 * Takes the already-computed match boolean rather than querying, because
 * every call site has just loaded that set for its own reasons and a second
 * lookup here would double the queries on the reel's hot path.
 */
export function photoUnlockedFor(params: { matched: boolean; viewerCanUnlockAll: boolean }): boolean {
  return params.matched || params.viewerCanUnlockAll;
}
