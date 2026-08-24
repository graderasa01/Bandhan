import type { User } from "@prisma/client";
import { missingRequired } from "@/lib/profile/stages";
import { profileTablesToDraftValues } from "@/lib/services/profile/fieldMapping";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import { noopT, type Translate } from "@/lib/i18n/translate";

export type TrustScoreLabel = "UNKNOWN" | "LOW" | "MODERATE" | "GOOD" | "STRONG";

export interface TrustFactor {
  label: string;
  points: number;
  description: string;
  /** Set only on the two verification improvement factors — a working CTA instead of a bare description. */
  actionHref?: string;
}

export interface TrustScoreResult {
  trustScore: number | null;
  scoreLabel: TrustScoreLabel;
  positiveFactors: TrustFactor[];
  improvementFactors: TrustFactor[];
  message: string;
}

/**
 * M04C's 16-factor formula. Ten factors are computed from real data below.
 * The other six — partner-referred/active (M10/M11) and admin-review/
 * rejection/block/flags (M04B verification review) — belong to modules this
 * pass doesn't build; they're named here so the shape doesn't change when
 * those modules land, but they contribute 0 today rather than being faked.
 */
const WEIGHTS = {
  mobileVerified: 10,
  emailVerified: 5,
  requiredComplete: 20,
  optionalFieldPoint: 1,
  optionalFieldMax: 15,
  photoUploaded: 10,
  photoApproved: 10,
  educationPresent: 5,
  professionPresent: 5,
  familyPresent: 5,
  preferencesPresent: 5,
} as const;

function label(score: number | null): TrustScoreLabel {
  if (score === null) return "UNKNOWN";
  if (score < 40) return "LOW";
  if (score < 65) return "MODERATE";
  if (score < 85) return "GOOD";
  return "STRONG";
}

export function computeTrustScore(
  user: Pick<User, "mobileVerifiedAt" | "emailVerifiedAt">,
  profile: ProfileWithSubTables,
  t: Translate = noopT,
): TrustScoreResult {
  const positives: TrustFactor[] = [];
  const improvements: TrustFactor[] = [];
  let score = 0;

  // UNKNOWN when there isn't even a live profile yet — M04A §3.1.
  if (!profile.basicDetails && !profile.education) {
    return {
      trustScore: null,
      scoreLabel: "UNKNOWN",
      positiveFactors: [],
      improvementFactors: [],
      message: t("trustScore.notCalculated", "Trust Score calculate nahi hui hai. Profile complete karein."),
    };
  }

  if (user.mobileVerifiedAt) {
    score += WEIGHTS.mobileVerified;
    positives.push({
      label: t("trustScore.mobileVerified.label", "Mobile Verified"),
      points: WEIGHTS.mobileVerified,
      description: t("trustScore.mobileVerified.description", "Mobile number verify ho chuka hai."),
    });
  } else {
    improvements.push({
      label: t("trustScore.mobileUnverified.label", "Mobile Verify Karein"),
      points: WEIGHTS.mobileVerified,
      description: t("trustScore.mobileUnverified.description", "OTP se mobile verify karein."),
      actionHref: "/user/verify-contact",
    });
  }

  if (user.emailVerifiedAt) {
    score += WEIGHTS.emailVerified;
    positives.push({
      label: t("trustScore.emailVerified.label", "Email Verified"),
      points: WEIGHTS.emailVerified,
      description: t("trustScore.emailVerified.description", "Email verify ho chuka hai."),
    });
  } else {
    improvements.push({
      label: t("trustScore.emailUnverified.label", "Email Verify Karein"),
      points: WEIGHTS.emailVerified,
      description: t("trustScore.emailUnverified.description", "Email se OTP verify karein."),
      actionHref: "/user/verify-contact",
    });
  }

  const draftValues = profileTablesToDraftValues({
    profile,
    basicDetails: profile.basicDetails,
    education: profile.education,
    profession: profile.profession,
    family: profile.family,
    lifestyle: profile.lifestyle,
    partnerPreferences: profile.partnerPreferences,
  });
  const missing = missingRequired(draftValues);
  if (missing.length === 0) {
    score += WEIGHTS.requiredComplete;
    positives.push({
      label: t("trustScore.requiredComplete.label", "Required Fields Complete"),
      points: WEIGHTS.requiredComplete,
      description: t("trustScore.requiredComplete.description", "Saare zaroori fields bhare hue hain."),
    });
  } else {
    improvements.push({
      label: t("trustScore.requiredIncomplete.label", "Required Fields Incomplete"),
      points: WEIGHTS.requiredComplete,
      description: `${missing.length}${t("trustScore.requiredIncomplete.descriptionSuffix", " zaroori fields baaki hain.")}`,
    });
  }

  const optionalFilled = Object.keys(draftValues).length;
  const optionalPoints = Math.min(optionalFilled * WEIGHTS.optionalFieldPoint, WEIGHTS.optionalFieldMax);
  if (optionalPoints > 0) {
    score += optionalPoints;
    positives.push({
      label: t("trustScore.optionalFields.label", "Profile Details"),
      points: optionalPoints,
      description: `${optionalFilled}${t("trustScore.optionalFields.descriptionSuffix", " fields bhare hue hain.")}`,
    });
  }

  const primaryPhoto = profile.photos.find((p) => p.isPrimary) ?? profile.photos[0];
  if (primaryPhoto) {
    score += WEIGHTS.photoUploaded;
    positives.push({
      label: t("trustScore.photoUploaded.label", "Photo Uploaded"),
      points: WEIGHTS.photoUploaded,
      description: t("trustScore.photoUploaded.description", "Profile photo add ho chuki hai."),
    });
    if (primaryPhoto.verificationStatus === "APPROVED") {
      score += WEIGHTS.photoApproved;
      positives.push({
        label: t("trustScore.photoVerified.label", "Photo Verified"),
        points: WEIGHTS.photoApproved,
        description: t("trustScore.photoVerified.description", "Photo verify ho chuki hai."),
      });
    } else {
      improvements.push({
        label: t("trustScore.photoPending.label", "Photo Verification Pending"),
        points: WEIGHTS.photoApproved,
        description: t("trustScore.photoPending.description", "Photo abhi review me hai."),
      });
    }
  } else {
    improvements.push({
      label: t("trustScore.photoMissing.label", "Photo Add Karein"),
      points: WEIGHTS.photoUploaded + WEIGHTS.photoApproved,
      description: t("trustScore.photoMissing.description", "Ek clear face photo add karein."),
    });
  }

  const presence: {
    present: boolean;
    addedLabel: string;
    addedDescription: string;
    incompleteLabel: string;
    incompleteDescription: string;
    points: number;
  }[] = [
    {
      present: Boolean(profile.education?.highestEducation),
      addedLabel: t("trustScore.education.addedLabel", "Education Added"),
      addedDescription: t("trustScore.education.addedDescription", "Education details bhar di gayi hain."),
      incompleteLabel: t("trustScore.education.incompleteLabel", "Education Incomplete"),
      incompleteDescription: t("trustScore.education.incompleteDescription", "Education add karein."),
      points: WEIGHTS.educationPresent,
    },
    {
      present: Boolean(profile.profession?.jobTitle),
      addedLabel: t("trustScore.profession.addedLabel", "Profession Added"),
      addedDescription: t("trustScore.profession.addedDescription", "Profession details bhar di gayi hain."),
      incompleteLabel: t("trustScore.profession.incompleteLabel", "Profession Incomplete"),
      incompleteDescription: t("trustScore.profession.incompleteDescription", "Profession add karein."),
      points: WEIGHTS.professionPresent,
    },
    {
      present: Boolean(profile.family?.familyType),
      addedLabel: t("trustScore.family.addedLabel", "Family Details Added"),
      addedDescription: t("trustScore.family.addedDescription", "Family background bhar diya gaya hai."),
      incompleteLabel: t("trustScore.family.incompleteLabel", "Family Details Incomplete"),
      incompleteDescription: t("trustScore.family.incompleteDescription", "Family Details add karein."),
      points: WEIGHTS.familyPresent,
    },
    {
      present: Boolean(profile.partnerPreferences?.minAge),
      addedLabel: t("trustScore.preferences.addedLabel", "Partner Preferences Added"),
      addedDescription: t("trustScore.preferences.addedDescription", "Partner preferences set kar di gayi hain."),
      incompleteLabel: t("trustScore.preferences.incompleteLabel", "Partner Preferences Incomplete"),
      incompleteDescription: t("trustScore.preferences.incompleteDescription", "Partner Preferences add karein."),
      points: WEIGHTS.preferencesPresent,
    },
  ];
  for (const p of presence) {
    if (p.present) {
      score += p.points;
      positives.push({ label: p.addedLabel, points: p.points, description: p.addedDescription });
    } else {
      improvements.push({ label: p.incompleteLabel, points: p.points, description: p.incompleteDescription });
    }
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const scoreLabel = label(clamped);

  return {
    trustScore: clamped,
    scoreLabel,
    positiveFactors: positives,
    improvementFactors: improvements,
    message:
      improvements.length > 0
        ? `${improvements[0].label}${t("trustScore.message.scoreCanReachPre", " se score ")}${clamped}${t("trustScore.message.scoreCanReachMid", " se ")}${Math.min(100, clamped + improvements[0].points)}${t("trustScore.message.scoreCanReachPost", " tak pahunch sakta hai.")}`
        : t("trustScore.message.strong", "Profile bahut strong hai."),
  };
}
