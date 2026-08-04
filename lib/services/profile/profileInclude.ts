export const PROFILE_FULL_INCLUDE = {
  basicDetails: true,
  education: true,
  profession: true,
  family: true,
  lifestyle: true,
  partnerPreferences: true,
  photos: true,
  user: { select: { mobileVerifiedAt: true } },
} as const;

/** Lightweight projection for list/chat contexts — avoids PROFILE_FULL_INCLUDE's cost for a list view. */
export const PROFILE_CHAT_SELECT = {
  id: true,
  displayName: true,
  trustScoreLabel: true,
  photos: {
    where: { isPrimary: true },
    take: 1,
    select: { fileUrl: true, verificationStatus: true },
  },
} as const;
