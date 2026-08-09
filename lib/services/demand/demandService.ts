import "server-only";
import { prisma } from "@/lib/db/prisma";
import { EDUCATION_FLOORS } from "@/lib/services/match/pipeline";
import { ageFromDate } from "@/lib/services/match/age";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * Rishta Demand — the matching pipeline run backwards.
 *
 * Every other screen answers "who matches me". This one answers "how many
 * people am I a match *for*", which is the only number a user can actually
 * act on. It is deliberately the same arithmetic as
 * `lib/services/match/pipeline.ts`, just with the viewer and the candidate
 * swapped — if the two ever disagree, this screen is lying to the user.
 *
 * No AI (D-32): every number below is a count of rows, and every lever is a
 * filter the user genuinely fails today. A lever that can't be traced to a
 * real seeker's real preference doesn't get shown.
 */

/** `strong` counts seekers whose preference score for you clears this — same 0-100 scale as L2. */
const STRONG_THRESHOLD = 70;

export type LeverKind = "unlock" | "strengthen";

export interface DemandLever {
  id: string;
  label: string;
  detail: string;
  /** How many seekers this actually affects. Never a projection — always a row count. */
  gain: number;
  kind: LeverKind;
  href: string;
}

export interface DemandSnapshot {
  /** Everyone looking for your gender, full stop. The size of your market. */
  seekers: number;
  /** Of those, how many can actually see you — i.e. you clear their hard filters. */
  reachable: number;
  /** Of the reachable, how many rank you strongly. */
  strong: number;
  levers: DemandLever[];
  /** Set when you are at zero for a reason no ranking tweak can fix. */
  blockedReason: string | null;
}

type Seeker = {
  currentCity: string | null;
  partnerPreferences: {
    minAge: number | null;
    maxAge: number | null;
    preferredCities: string[];
    educationPreference: string | null;
  } | null;
};

/** True when the seeker states a city preference that a missing/other city fails. */
function hasRealCityPreference(cities: string[]): boolean {
  return cities.length > 0 && !cities.includes("Kahin bhi");
}

/** Mirror of pipeline.scoreCityMatch, viewed from the seeker's side. */
function cityScoreForMe(seeker: Seeker, myCity: string | null): number {
  const wanted = seeker.partnerPreferences?.preferredCities ?? [];
  if (!hasRealCityPreference(wanted)) return 100;
  if (wanted.includes("Isi sheher me") && myCity && myCity === seeker.currentCity) return 100;
  if (myCity && wanted.includes(myCity)) return 100;
  return 40;
}

/** Mirror of pipeline.scoreEducationMatch, viewed from the seeker's side. */
function educationScoreForMe(seeker: Seeker, myEducation: string | null): number {
  const wanted = seeker.partnerPreferences?.educationPreference;
  if (!wanted || wanted === "Koi farak nahi") return 100;
  const floor = EDUCATION_FLOORS[wanted];
  if (!floor) return 70;
  return myEducation && floor.includes(myEducation) ? 100 : 30;
}

/**
 * L0 from the seeker's side: age is the only preference that hard-excludes in
 * `getCandidates`, so it is the only one that hard-excludes here. A missing
 * date of birth fails every seeker who set a range — that is not a penalty we
 * invented, it is what the `dateOfBirth: { gte, lte }` filter already does.
 */
function passesHardFilter(seeker: Seeker, myAge: number | null): boolean {
  const { minAge, maxAge } = seeker.partnerPreferences ?? { minAge: null, maxAge: null };
  if (minAge == null && maxAge == null) return true;
  if (myAge == null) return false;
  if (minAge != null && myAge < minAge) return false;
  if (maxAge != null && myAge > maxAge) return false;
  return true;
}

export async function getDemandSnapshot(
  profile: ProfileWithSubTables,
  t: Translate = noopT,
): Promise<DemandSnapshot> {
  const myGender = profile.gender;

  // Nobody can look for you until the app knows what you are.
  if (!myGender) {
    return {
      seekers: 0,
      reachable: 0,
      strong: 0,
      blockedReason: t("demand.blocked.noGender", "Gender bhare bina koi aapko dhoondh nahi sakta."),
      levers: [
        {
          id: "gender",
          label: t("demand.lever.gender.label", "Gender add karein"),
          detail: t("demand.lever.gender.detail", "Iske bina aap kisi ki bhi list me nahi aate."),
          gain: 0,
          kind: "unlock",
          href: "/profile/build",
        },
      ],
    };
  }

  const seekers: Seeker[] = await prisma.profile.findMany({
    where: {
      userId: { not: profile.userId },
      isVisible: true,
      profileStatus: { in: ["SUBMITTED", "VERIFIED"] },
      deletedAt: null,
      partnerPreferences: { lookingForGender: myGender },
    },
    select: {
      currentCity: true,
      partnerPreferences: {
        select: {
          minAge: true,
          maxAge: true,
          preferredCities: true,
          educationPreference: true,
        },
      },
    },
  });

  const myAge = ageFromDate(profile.dateOfBirth);
  const myCity = profile.currentCity;
  const myEducation = profile.education?.highestEducation ?? null;

  let reachable = 0;
  let strong = 0;
  // Lever inputs — counted while we walk the list, so each number below is a
  // tally of real seekers rather than an estimate.
  let blockedByMissingDob = 0;
  let weakOnCity = 0;
  let weakOnEducation = 0;

  for (const seeker of seekers) {
    if (!passesHardFilter(seeker, myAge)) {
      if (myAge == null) blockedByMissingDob++;
      continue;
    }
    reachable++;

    const city = cityScoreForMe(seeker, myCity);
    const education = educationScoreForMe(seeker, myEducation);
    // Deal-breakers score 100 here: they are keyword checks against lifestyle
    // answers, and a user who hasn't answered them isn't violating anything.
    const preferenceScore = Math.round(city * 0.4 + education * 0.3 + 100 * 0.3);
    if (preferenceScore >= STRONG_THRESHOLD) strong++;

    if (city < 100) weakOnCity++;
    if (education < 100) weakOnEducation++;
  }

  // A profile that isn't live appears in nobody's reel, whatever the counts say.
  const isLive = profile.isVisible && (profile.profileStatus === "SUBMITTED" || profile.profileStatus === "VERIFIED");
  const blockedReason = isLive
    ? null
    : t("demand.blocked.notLive", "Aapki profile abhi live nahi hai — isliye ye log aapko dekh nahi paa rahe.");

  const levers: DemandLever[] = [];

  if (!isLive) {
    levers.push({
      id: "go-live",
      label: t("demand.lever.goLive.label", "Profile live karein"),
      detail: `${t("demand.lever.goLive.detailPre", "Live hote hi aap ")}${reachable}${t("demand.lever.goLive.detailPost", " logon ki list me aa jayenge.")}`,
      gain: reachable,
      kind: "unlock",
      href: "/profile/build",
    });
  }

  if (myAge == null && blockedByMissingDob > 0) {
    levers.push({
      id: "dob",
      label: t("demand.lever.dob.label", "Date of birth add karein"),
      detail: `${blockedByMissingDob}${t(
        "demand.lever.dob.detailSuffix",
        " log umar ke hisaab se dhoondh rahe hain — DOB ke bina aap unki list me aate hi nahi.",
      )}`,
      gain: blockedByMissingDob,
      kind: "unlock",
      href: "/profile/build",
    });
  }

  if (weakOnCity > 0) {
    levers.push({
      id: "city",
      label: myCity
        ? t("demand.lever.city.labelReview", "City preference dekhein")
        : t("demand.lever.city.labelAdd", "Current city add karein"),
      detail: myCity
        ? `${weakOnCity}${t(
            "demand.lever.city.detailWithCitySuffix",
            " log doosre sheher dhoondh rahe hain — unki list me aap neeche aate hain.",
          )}`
        : `${weakOnCity}${t(
            "demand.lever.city.detailNoCitySuffix",
            " logon ne city preference set ki hai. City bhare bina aap unki list me neeche rehte hain.",
          )}`,
      gain: weakOnCity,
      kind: "strengthen",
      href: "/profile/build",
    });
  }

  if (weakOnEducation > 0) {
    levers.push({
      id: "education",
      label: myEducation
        ? t("demand.lever.education.labelComplete", "Education detail poori karein")
        : t("demand.lever.education.labelAdd", "Education add karein"),
      detail: `${weakOnEducation}${t(
        "demand.lever.education.detailSuffix",
        " logon ki education preference se aap abhi match nahi karte.",
      )}`,
      gain: weakOnEducation,
      kind: "strengthen",
      href: "/profile/build",
    });
  }

  const primaryPhoto = profile.photos.find((p) => p.isPrimary) ?? profile.photos[0];
  if (reachable > 0 && primaryPhoto?.verificationStatus !== "APPROVED") {
    levers.push({
      id: "photo",
      label: primaryPhoto
        ? t("demand.lever.photo.labelVerify", "Photo verify hone dein")
        : t("demand.lever.photo.labelAdd", "Photo add karein"),
      detail: primaryPhoto
        ? `${t("demand.lever.photo.detailVerifyPre", "Verified photo trust score badhata hai, aur trust score in ")}${reachable}${t(
            "demand.lever.photo.detailVerifyPost",
            " logon ki ranking me ginta hai.",
          )}`
        : `${t("demand.lever.photo.detailAddPre", "Photo ke bina trust score kam rehta hai — ye in ")}${reachable}${t(
            "demand.lever.photo.detailAddPost",
            " logon ki ranking me ginta hai.",
          )}`,
      gain: reachable,
      kind: "strengthen",
      href: "/profile/build",
    });
  }

  // Biggest real effect first; ties keep insertion order (unlock before strengthen).
  levers.sort((a, b) => b.gain - a.gain);

  return {
    seekers: seekers.length,
    reachable: isLive ? reachable : 0,
    strong: isLive ? strong : 0,
    levers: levers.slice(0, 4),
    blockedReason,
  };
}
