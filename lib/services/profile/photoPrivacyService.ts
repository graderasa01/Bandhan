import "server-only";
import type { PhotoPrivacy } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * The owner's own photo choice (D-90) — the one setting that can close a photo
 * the "apni photo lagao, sabki dekho" rule would otherwise open.
 *
 * Owner-only and never plan-gated in either direction: who sees your face is
 * yours to decide, and a setting that needed a plan to switch would be selling
 * privacy back to the person it belongs to. The read path is
 * `photoUnlockedFor()` — this file only stores the choice.
 */

export async function getPhotoPrivacy(userId: string): Promise<PhotoPrivacy | null> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { photoPrivacy: true } });
  return profile?.photoPrivacy ?? null;
}

export type SetPhotoPrivacyResult = { ok: true; value: PhotoPrivacy } | { ok: false; message: string };

export async function setPhotoPrivacy(
  userId: string,
  value: PhotoPrivacy,
  t: Translate = noopT,
): Promise<SetPhotoPrivacyResult> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) {
    return { ok: false, message: t("profileServices.photoPrivacy.profileRequired", "Pehle apni profile banaiye.") };
  }
  await prisma.profile.update({ where: { userId }, data: { photoPrivacy: value } });
  return { ok: true, value };
}
