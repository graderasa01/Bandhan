import type { User } from "@prisma/client";
import { missingRequired } from "@/lib/profile/stages";
import { profileTablesToDraftValues } from "@/lib/services/profile/fieldMapping";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

export type TrustScoreLabel = "UNKNOWN" | "LOW" | "MODERATE" | "GOOD" | "STRONG";

export interface TrustFactor {
  label: string;
  points: number;
  description: string;
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
      message: "Trust Score calculate nahi hui hai. Profile complete karein.",
    };
  }

  if (user.mobileVerifiedAt) {
    score += WEIGHTS.mobileVerified;
    positives.push({ label: "Mobile Verified", points: WEIGHTS.mobileVerified, description: "Mobile number verify ho chuka hai." });
  } else {
    improvements.push({ label: "Mobile Verify Karein", points: WEIGHTS.mobileVerified, description: "OTP se mobile verify karein." });
  }

  if (user.emailVerifiedAt) {
    score += WEIGHTS.emailVerified;
    positives.push({ label: "Email Verified", points: WEIGHTS.emailVerified, description: "Email verify ho chuka hai." });
  } else {
    improvements.push({ label: "Email Verify Karein", points: WEIGHTS.emailVerified, description: "Email link se verify karein." });
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
    positives.push({ label: "Required Fields Complete", points: WEIGHTS.requiredComplete, description: "Saare zaroori fields bhare hue hain." });
  } else {
    improvements.push({
      label: "Required Fields Incomplete",
      points: WEIGHTS.requiredComplete,
      description: `${missing.length} zaroori fields baaki hain.`,
    });
  }

  const optionalFilled = Object.keys(draftValues).length;
  const optionalPoints = Math.min(optionalFilled * WEIGHTS.optionalFieldPoint, WEIGHTS.optionalFieldMax);
  if (optionalPoints > 0) {
    score += optionalPoints;
    positives.push({ label: "Profile Details", points: optionalPoints, description: `${optionalFilled} fields bhare hue hain.` });
  }

  const primaryPhoto = profile.photos.find((p) => p.isPrimary) ?? profile.photos[0];
  if (primaryPhoto) {
    score += WEIGHTS.photoUploaded;
    positives.push({ label: "Photo Uploaded", points: WEIGHTS.photoUploaded, description: "Profile photo add ho chuki hai." });
    if (primaryPhoto.verificationStatus === "APPROVED") {
      score += WEIGHTS.photoApproved;
      positives.push({ label: "Photo Verified", points: WEIGHTS.photoApproved, description: "Photo verify ho chuki hai." });
    } else {
      improvements.push({ label: "Photo Verification Pending", points: WEIGHTS.photoApproved, description: "Photo abhi review me hai." });
    }
  } else {
    improvements.push({ label: "Photo Add Karein", points: WEIGHTS.photoUploaded + WEIGHTS.photoApproved, description: "Ek clear face photo add karein." });
  }

  const presence: [boolean, string, number, string][] = [
    [Boolean(profile.education?.highestEducation), "Education Added", WEIGHTS.educationPresent, "Education details bhar di gayi hain."],
    [Boolean(profile.profession?.jobTitle), "Profession Added", WEIGHTS.professionPresent, "Profession details bhar di gayi hain."],
    [Boolean(profile.family?.familyType), "Family Details Added", WEIGHTS.familyPresent, "Family background bhar diya gaya hai."],
    [Boolean(profile.partnerPreferences?.minAge), "Partner Preferences Added", WEIGHTS.preferencesPresent, "Partner preferences set kar di gayi hain."],
  ];
  for (const [present, l, points, desc] of presence) {
    if (present) {
      score += points;
      positives.push({ label: l, points, description: desc });
    } else {
      improvements.push({ label: `${l.replace(" Added", "")} Incomplete`, points, description: `${l.replace(" Added", "")} add karein.` });
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
        ? `${improvements[0].label} se score ${clamped} se ${Math.min(100, clamped + improvements[0].points)} tak pahunch sakta hai.`
        : "Profile bahut strong hai.",
  };
}
