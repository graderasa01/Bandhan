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
    photoLock: "open",
    spotlight: false,
    photoFocalY: primaryPhoto?.focalY ?? null,
    slides: buildPhotoSlides(p.photos),
    bioNote: p.bioText?.trim() || null,
    // Both are answers *about a viewer* — "near me", "new to me" — and there is
    // no viewer here, so they stay false rather than being answered about
    // oneself, same reasoning as the empty compatibility fields above.
    voiceNote: null,
    nearby: false,
    isNew: false,
    rankScore: null,
    segments: [],
    preference: { state: "NOT_PROVIDED", score: null, note: null },
    strengths: [],
    concern: null,
    sharedTags: [],
    kundli: { milan: null, note: null, notes: [] },
    mission: null,
    vibeBadge: null,
    askedStatus: "NONE",
    whyThisMatch: { reasons: [], valueConnection: null, unclear: null, starter: null },
    facts: [],
  };
}
