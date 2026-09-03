import { getOrCreateProfile } from "@/lib/services/profile/draftService";
import { ageFromDate } from "@/lib/services/match/age";
import { buildPhotoSlides } from "@/lib/services/profile/photoSlides";
import type { ReelCardViewModel } from "@/lib/contracts/reel";

/**
 * Builds the same card shape a matched stranger eventually sees
 * (reelData.ts's private `toCard`), but for the profile owner's own
 * "how do I look" preview rather than a scored candidate. Always unlocked —
 * there's no one to unlock it for — and every match-scoring field
 * (compatibility, mission, sharedTags, kundliNotes, ...) is genuinely empty
 * rather than faked, since none of it applies to viewing yourself. `ReelCard`'s
 * `selfPreview` prop is what keeps the empty compatibility ring from reading
 * as a real "0%" score.
 */
export async function getSelfReelCard(userId: string): Promise<ReelCardViewModel> {
  const p = await getOrCreateProfile(userId);
  const primaryPhoto = p.photos.find((ph) => ph.isPrimary) ?? p.photos[0];

  return {
    id: p.id,
    displayName: p.displayName ?? "Profile",
    age: ageFromDate(p.dateOfBirth),
    city: p.currentCity,
    education: p.education?.highestEducation ?? null,
    profession: p.profession?.jobTitle ?? null,
    verified: primaryPhoto?.verificationStatus === "APPROVED",
    mobileVerified: Boolean(p.user?.mobileVerifiedAt),
    trustScore: p.trustScore,
    photoUrl: primaryPhoto?.fileUrl ?? null,
    photoUnlocked: true,
    photoFocalY: primaryPhoto?.focalY ?? null,
    slides: buildPhotoSlides(p.photos),
    bioNote: p.bioText?.trim() || null,
    compatibility: 0,
    segments: [],
    strengths: [],
    concern: null,
    sharedTags: [],
    kundliNotes: [],
    mission: null,
    vibeBadge: null,
    askedStatus: "NONE",
    // Never labelled. A Spotlight label is a disclosure to a *stranger* about
    // why this card is in their deck; on the owner's own preview it would be
    // telling them something about themselves they already know, in a chip
    // meant for somebody else.
    spotlight: null,
  };
}
