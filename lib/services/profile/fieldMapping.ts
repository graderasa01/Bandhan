/**
 * The seam `lib/profile/profileState.tsx` already promised: translates the
 * flat interview-catalog draft (`lib/profile/fields.ts` keys → string values,
 * multiselects comma-joined) into the normalized M03B tables. One direction
 * only — DB → draft isn't needed because the client always reconstructs its
 * flat view from `GET /api/profile/me`'s own flat `values` field (see
 * `profileToDraftValues` below), not by re-deriving it from relational rows.
 */

import { professionCategoryFor } from "@/lib/profile/quickPicks";

function splitMulti(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const FEET_INCHES = /^(\d+)'(\d{1,2})"$/;

function heightToCm(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = value.match(FEET_INCHES);
  if (!m) return undefined;
  const feet = Number(m[1]);
  const inches = Number(m[2]);
  return Math.round((feet * 12 + inches) * 2.54);
}

function parseDateOfBirth(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const ddmmyyyy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, mo, y] = ddmmyyyy;
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** "25–29" → {min:25,max:29}; "35+" → {min:35}. */
function parseAgeRange(value: string | undefined): { min?: number; max?: number } {
  if (!value) return {};
  const plus = value.match(/^(\d+)\+$/);
  if (plus) return { min: Number(plus[1]) };
  const range = value.match(/^(\d+)[–-](\d+)$/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  return {};
}

function oppositeGender(gender: string | undefined): string | undefined {
  if (gender === "Ladka") return "Ladki";
  if (gender === "Ladki") return "Ladka";
  return undefined;
}

export function mapDraftToProfileTables(values: Record<string, string>) {
  const ageRange = parseAgeRange(values.partnerAgeRange);

  return {
    profile: {
      displayName: values.fullName || undefined,
      gender: values.gender || undefined,
      dateOfBirth: parseDateOfBirth(values.dateOfBirth),
      maritalStatus: values.maritalStatus || undefined,
      heightCm: heightToCm(values.height),
      currentCity: values.currentCity || undefined,
      nativePlace: values.nativePlace || undefined,
      bioText: values.aboutMe || undefined,
    },
    basicDetails: {
      firstName: values.fullName?.split(" ")[0] || undefined,
      lastName: values.fullName?.split(" ").slice(1).join(" ") || undefined,
      motherTongue: values.motherTongue || undefined,
      religion: values.religion || undefined,
      caste: values.caste || undefined,
      gotra: values.gotra || undefined,
      manglikStatus: values.manglikStatus || undefined,
      birthTime: values.birthTime || undefined,
      birthPlace: values.birthPlace || undefined,
    },
    education: {
      highestEducation: values.education || undefined,
    },
    profession: {
      jobTitle: values.profession || undefined,
      // `professionCategory` has been read by discovery search
      // (`filters.professionCategory`), behaviour learning and Deep Profile
      // since those shipped — and written by nothing, so the column was null
      // on every row and the filter matched nobody. The tap deck's work
      // cascade is what finally produces a category worth storing, and this
      // derives it from the job title so a profession that arrived any other
      // way (voice, biodata, an older row) gets one too.
      professionCategory: professionCategoryFor(values.profession),
      workCity: values.workLocation || undefined,
      annualIncomeRange: values.annualIncome || undefined,
    },
    family: {
      familyType: values.familyType || undefined,
      fatherOccupation: values.fatherOccupation || undefined,
      motherOccupation: values.motherOccupation || undefined,
      siblingsCount: values.siblings || undefined,
      siblingsMarriedStatus: values.siblingsMarried || undefined,
      familyValues: values.familyValues || undefined,
    },
    lifestyle: {
      diet: values.diet || undefined,
      smoking: values.smoking || undefined,
      drinking: values.drinking || undefined,
      hobbies: splitMulti(values.hobbies),
      languagesKnown: splitMulti(values.languagesKnown),
      relocateWilling: values.relocateWilling || undefined,
      weekendVibe: values.weekendVibe || undefined,
      bigDecisionStyle: values.bigDecisionStyle || undefined,
      socialEnergy: values.socialEnergy || undefined,
    },
    partnerPreferences: {
      lookingForGender: oppositeGender(values.gender),
      minAge: ageRange.min,
      maxAge: ageRange.max,
      preferredCities: splitMulti(values.partnerCityPreference),
      educationPreference: values.partnerEducation || undefined,
      religionPreference: values.partnerReligionPreference || undefined,
      castePreference: values.partnerCastePreference || undefined,
      manglikPreference: values.partnerManglikPreference || undefined,
      partnerWorkExpectation: values.partnerWorkExpectation || undefined,
      dealBreakers: values.dealBreakers ? [values.dealBreakers] : [],
    },
  };
}

/**
 * The reverse view the client actually uses: `GET /api/profile/me` returns
 * these flat catalog keys directly (not the relational shape) so
 * `profileState.tsx`'s consumers never learn the DB moved.
 */
export function profileTablesToDraftValues(row: {
  profile: {
    displayName: string | null;
    gender: string | null;
    dateOfBirth: Date | null;
    maritalStatus: string | null;
    heightCm: number | null;
    currentCity: string | null;
    nativePlace: string | null;
    bioText: string | null;
  };
  basicDetails: {
    motherTongue: string | null;
    religion: string | null;
    caste: string | null;
    gotra: string | null;
    manglikStatus: string | null;
    birthTime: string | null;
    birthPlace: string | null;
  } | null;
  education: { highestEducation: string | null } | null;
  profession: { jobTitle: string | null; workCity: string | null; annualIncomeRange: string | null } | null;
  family: {
    familyType: string | null;
    fatherOccupation: string | null;
    motherOccupation: string | null;
    siblingsCount: string | null;
    siblingsMarriedStatus: string | null;
    familyValues: string | null;
  } | null;
  lifestyle: {
    diet: string | null;
    smoking: string | null;
    drinking: string | null;
    hobbies: string[];
    languagesKnown: string[];
    relocateWilling: string | null;
    weekendVibe: string | null;
    bigDecisionStyle: string | null;
    socialEnergy: string | null;
  } | null;
  partnerPreferences: {
    minAge: number | null;
    maxAge: number | null;
    preferredCities: string[];
    educationPreference: string | null;
    religionPreference: string | null;
    castePreference: string | null;
    manglikPreference: string | null;
    partnerWorkExpectation: string | null;
    dealBreakers: string[];
  } | null;
}): Record<string, string> {
  const cmToFeetInches = (cm: number | null) => {
    if (!cm) return undefined;
    const totalInches = Math.round(cm / 2.54);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
  };
  const ageRangeLabel = (min: number | null, max: number | null) => {
    if (min && max) return `${min}–${max}`;
    if (min && !max) return `${min}+`;
    return undefined;
  };

  const values: Record<string, string | undefined> = {
    fullName: row.profile.displayName ?? undefined,
    gender: row.profile.gender ?? undefined,
    dateOfBirth: row.profile.dateOfBirth?.toISOString().slice(0, 10),
    maritalStatus: row.profile.maritalStatus ?? undefined,
    height: cmToFeetInches(row.profile.heightCm),
    currentCity: row.profile.currentCity ?? undefined,
    nativePlace: row.profile.nativePlace ?? undefined,
    aboutMe: row.profile.bioText ?? undefined,

    motherTongue: row.basicDetails?.motherTongue ?? undefined,
    religion: row.basicDetails?.religion ?? undefined,
    caste: row.basicDetails?.caste ?? undefined,
    gotra: row.basicDetails?.gotra ?? undefined,
    manglikStatus: row.basicDetails?.manglikStatus ?? undefined,
    birthTime: row.basicDetails?.birthTime ?? undefined,
    birthPlace: row.basicDetails?.birthPlace ?? undefined,

    education: row.education?.highestEducation ?? undefined,

    profession: row.profession?.jobTitle ?? undefined,
    workLocation: row.profession?.workCity ?? undefined,
    annualIncome: row.profession?.annualIncomeRange ?? undefined,

    familyType: row.family?.familyType ?? undefined,
    fatherOccupation: row.family?.fatherOccupation ?? undefined,
    motherOccupation: row.family?.motherOccupation ?? undefined,
    siblings: row.family?.siblingsCount ?? undefined,
    siblingsMarried: row.family?.siblingsMarriedStatus ?? undefined,
    familyValues: row.family?.familyValues ?? undefined,

    diet: row.lifestyle?.diet ?? undefined,
    smoking: row.lifestyle?.smoking ?? undefined,
    drinking: row.lifestyle?.drinking ?? undefined,
    hobbies: row.lifestyle?.hobbies?.join(", ") || undefined,
    languagesKnown: row.lifestyle?.languagesKnown?.join(", ") || undefined,
    relocateWilling: row.lifestyle?.relocateWilling ?? undefined,
    weekendVibe: row.lifestyle?.weekendVibe ?? undefined,
    bigDecisionStyle: row.lifestyle?.bigDecisionStyle ?? undefined,
    socialEnergy: row.lifestyle?.socialEnergy ?? undefined,

    partnerAgeRange: ageRangeLabel(
      row.partnerPreferences?.minAge ?? null,
      row.partnerPreferences?.maxAge ?? null,
    ),
    partnerCityPreference: row.partnerPreferences?.preferredCities?.join(", ") || undefined,
    partnerEducation: row.partnerPreferences?.educationPreference ?? undefined,
    partnerReligionPreference: row.partnerPreferences?.religionPreference ?? undefined,
    partnerCastePreference: row.partnerPreferences?.castePreference ?? undefined,
    partnerManglikPreference: row.partnerPreferences?.manglikPreference ?? undefined,
    partnerWorkExpectation: row.partnerPreferences?.partnerWorkExpectation ?? undefined,
    dealBreakers: row.partnerPreferences?.dealBreakers?.[0] ?? undefined,
  };

  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}
