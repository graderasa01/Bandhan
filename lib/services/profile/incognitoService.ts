import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getEntitlements } from "@/lib/services/plans/entitlements";

/**
 * Incognito browsing — the one place that answers "is this person hidden right
 * now", so that the swipe path and the settings UI can never disagree.
 *
 * ## Why it is symmetric
 *
 * While incognito is on, the user is also *denied* viewer identities of their
 * own (see `canSeeViewerIdentity` in entitlements.ts). The asymmetric version —
 * see everyone, be seen by nobody — is what most matrimony products sell, and
 * it is exactly the shape this app has refused elsewhere: `viewerIdentity` is
 * Premium-only precisely because "who looked at me" is a sensitive signal, and
 * a feature that lets one side collect it while withholding their own turns
 * that friction into a one-way mirror. Devesh chose symmetric explicitly
 * (2026-08-07) when both options were put to him.
 *
 * ## What it does not hide
 *
 * Shortlisting. `admirerIdentity` is a separate, already-sold signal, and
 * saving somebody is a deliberate act rather than browsing — a user who
 * shortlists you has done something they can reasonably be named for. Only
 * `SwipeAction` attribution is suppressed.
 */

/**
 * True only when the plan allows it **and** the user has switched it on.
 *
 * Both halves matter on the read path, not just at the toggle: a Premium user
 * who turns incognito on and later downgrades must stop being hidden, and this
 * is where that happens. Past swipes stay hidden regardless — those rows were
 * stamped when the promise was live (`SwipeAction.incognito`).
 */
export async function isBrowsingIncognito(userId: string): Promise<boolean> {
  const [profile, entitlements] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: { incognitoEnabled: true } }),
    getEntitlements(userId),
  ]);
  return Boolean(profile?.incognitoEnabled) && entitlements.incognitoBrowse;
}

/** The raw switch, without the plan check — for rendering the settings row. */
export async function getIncognitoSetting(userId: string): Promise<boolean> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { incognitoEnabled: true },
  });
  return Boolean(profile?.incognitoEnabled);
}

export type SetIncognitoResult = { ok: true; enabled: boolean } | { ok: false; message: string };

export async function setIncognito(userId: string, enabled: boolean): Promise<SetIncognitoResult> {
  // Turning it *off* is never gated. Someone whose plan lapsed while hidden
  // must be able to come back out, and a downgrade that traps a setting on is
  // a support ticket waiting to happen.
  if (enabled) {
    const { incognitoBrowse } = await getEntitlements(userId);
    if (!incognitoBrowse) {
      return { ok: false, message: "Incognito browsing Premium plan me milti hai." };
    }
  }

  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return { ok: false, message: "Pehle apni profile banaiye." };

  await prisma.profile.update({ where: { userId }, data: { incognitoEnabled: enabled } });
  return { ok: true, enabled };
}
