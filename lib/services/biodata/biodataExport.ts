import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * The shaadi biodata every Indian family already makes by hand in Word and
 * forwards on WhatsApp — built from data the profile builder has collected all
 * along.
 *
 * This is a self-export: it renders the owner's own profile for the owner, so
 * nothing here is privacy-gated the way a candidate view would be. The two
 * genuinely sensitive lines — mobile number and income — are still opt-in,
 * because "share my biodata" and "publish my salary to the extended family"
 * are not the same decision.
 *
 * Every value is formatted server-side. Dates rendered with `toLocaleDateString`
 * on the client would hydrate differently per timezone, and a biodata whose
 * date of birth flickers is not a document anyone will trust.
 */

export interface BiodataRow {
  label: string;
  value: string;
}

export interface BiodataSection {
  title: string;
  rows: BiodataRow[];
}

export interface BiodataDocument {
  name: string;
  photoUrl: string | null;
  /** The one-line intro, if the user has written or generated a bio. */
  tagline: string | null;
  sections: BiodataSection[];
  /** Rendered in the footer so a forwarded biodata still points home. */
  verifiedLabel: string | null;
}

export interface BiodataOptions {
  includeMobile: boolean;
  includeIncome: boolean;
  mobile: string | null;
}

function cmToFeetInches(cm: number | null): string | null {
  if (!cm) return null;
  const totalInches = Math.round(cm / 2.54);
  return `${Math.floor(totalInches / 12)}'${totalInches % 12}" (${cm} cm)`;
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function joinNonEmpty(parts: (string | null | undefined)[], separator = ", "): string | null {
  const clean = parts.filter((p): p is string => Boolean(p && p.trim()));
  return clean.length > 0 ? clean.join(separator) : null;
}

/** Drops empty rows — a biodata with "Gotra: —" printed on it looks unfinished. */
function section(title: string, rows: (BiodataRow | null)[]): BiodataSection | null {
  const present = rows.filter((r): r is BiodataRow => r !== null && Boolean(r.value));
  return present.length > 0 ? { title, rows: present } : null;
}

function row(label: string, value: string | null | undefined): BiodataRow | null {
  return value && value.trim() ? { label, value: value.trim() } : null;
}

export function buildBiodata(profile: ProfileWithSubTables, options: BiodataOptions): BiodataDocument {
  const basic = profile.basicDetails;
  const education = profile.education;
  const profession = profile.profession;
  const family = profile.family;
  const lifestyle = profile.lifestyle;
  const prefs = profile.partnerPreferences;

  const fullName =
    joinNonEmpty([basic?.firstName, basic?.lastName], " ") ?? profile.displayName ?? "Biodata";

  const primaryPhoto = profile.photos.find((p) => p.isPrimary) ?? profile.photos[0];

  const sections = [
    section("Vyaktigat Jaankari", [
      row("Naam", fullName),
      row("Janam Tithi", formatDate(profile.dateOfBirth)),
      row("Janam Samay", basic?.birthTime),
      row("Janam Sthan", basic?.birthPlace),
      row("Height", cmToFeetInches(profile.heightCm)),
      row("Marital Status", profile.maritalStatus),
      row("Dharm", basic?.religion),
      row("Samaj / Community", basic?.community),
      row("Jaati", basic?.caste),
      row("Gotra", basic?.gotra),
      // Suppressed when the user told us they don't observe it — the same
      // promise the profile builder makes at the point of asking.
      basic?.manglikStatus === "Hum nahi maante" ? null : row("Manglik", basic?.manglikStatus),
      row("Matra Bhasha", basic?.motherTongue),
      row("Vartaman Sheher", joinNonEmpty([profile.currentCity, profile.currentState, profile.currentCountry])),
      row("Mool Nivas", profile.nativePlace),
    ]),

    section("Shiksha Aur Karya", [
      row("Shiksha", education?.highestEducation),
      row("Degree", education?.degreeName),
      row("College", education?.collegeName),
      row("Kaam", joinNonEmpty([profession?.jobTitle, profession?.professionCategory], " · ")),
      row("Company", profession?.companyName),
      row("Karya Sthal", profession?.workCity),
      options.includeIncome ? row("Varshik Aay", profession?.annualIncomeRange) : null,
    ]),

    section("Parivaar", [
      row("Pita Ji", family?.fatherOccupation),
      row("Mata Ji", family?.motherOccupation),
      row("Bhai / Behen", joinNonEmpty([family?.siblingsCount, family?.siblingsMarriedStatus], " · ")),
      row("Parivaar Ka Prakar", family?.familyType),
      row("Parivaar Ke Sanskar", family?.familyValues),
      row("Parivaar Ke Baare Me", family?.familyBackgroundSummary),
    ]),

    section("Jeevan Shaili", [
      row("Khaan-Paan", lifestyle?.diet),
      row("Bhashayein", lifestyle?.languagesKnown?.length ? lifestyle.languagesKnown.join(", ") : null),
      row("Shauk", lifestyle?.hobbies?.length ? lifestyle.hobbies.join(", ") : null),
    ]),

    section("Jeevansaathi Se Apeksha", [
      row("Umar", prefs?.minAge && prefs?.maxAge ? `${prefs.minAge}–${prefs.maxAge} saal` : null),
      row("Sheher", prefs?.preferredCities?.length ? prefs.preferredCities.join(", ") : null),
      row("Shiksha", prefs?.educationPreference),
      row("Marital Status", prefs?.maritalStatusPreference),
    ]),

    section("Sampark", [options.includeMobile ? row("Mobile", options.mobile) : null]),
  ].filter((s): s is BiodataSection => s !== null);

  return {
    name: fullName,
    photoUrl: primaryPhoto?.fileUrl ?? null,
    tagline: profile.bioText?.trim() || null,
    sections,
    verifiedLabel:
      primaryPhoto?.verificationStatus === "APPROVED" || profile.profileStatus === "VERIFIED"
        ? "BandhanTak par verified profile"
        : null,
  };
}
