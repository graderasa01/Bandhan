import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { canUsePhotoEnhance, canUsePhotoUltraEnhance } from "@/lib/services/plans/entitlements";

export const runtime = "nodejs";

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const [profile, canPhotoEnhance, canPhotoUltraEnhance] = await Promise.all([
    getOrCreateProfile(user.id),
    canUsePhotoEnhance(user.id),
    canUsePhotoUltraEnhance(user.id),
  ]);
  const { percent, missingFields, isLive, draftValues } = computeCompletion(profile);

  return NextResponse.json({
    canPhotoEnhance,
    canPhotoUltraEnhance,
    voiceSelfFillStatus: user.voiceSelfFillStatus,
    profileId: profile.id,
    profileStatus: profile.profileStatus,
    values: draftValues,
    completionPercent: percent,
    missingFields,
    isLive,
    // Flat and small on purpose — PhotoUploadCard's whole read model, not a
    // relational shape callers have to know how to include themselves.
    photos: profile.photos
      .filter((p) => !p.deletedAt)
      .map((p) => ({
        id: p.id,
        fileUrl: p.fileUrl,
        isPrimary: p.isPrimary,
        verificationStatus: p.verificationStatus,
        note: p.note,
        slotOrder: p.slotOrder,
        focalY: p.focalY,
      })),
  });
}
