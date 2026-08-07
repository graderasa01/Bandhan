import { ageFromDate } from "./age";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import type { ProfileVisibilityLevel } from "@/lib/services/profile/visibility";

/**
 * The single answer to "what may an AI know about somebody else".
 *
 * Before this file there were two answers, and they had drifted:
 *
 *   • `candidateSummary` in `explain.ts` — 9 fields, no bio
 *   • `safeFields` in `app/api/reel/ask/route.ts` — 13 fields, *with* bio
 *
 * Both claimed to implement §23.3 ("only what's allowed to be visible to a
 * viewer ever reaches the prompt"), neither referenced the other, and neither
 * knew what visibility level its viewer actually held — both were hard-coded to
 * the L1 set because L1 was the only case that existed when they were written.
 * A third copy for Grio's candidate dossier would have made the drift
 * permanent, so this is the one definition all three now read.
 *
 * ## The level is not decoration
 *
 * The split below matches `lib/data/profileViewData.ts`'s `showL2`/`showL3`
 * field-for-field on purpose. If the page and the AI disagree about what a
 * viewer may see, the user finds out by asking Grio something the page won't
 * show them — and every promise `lib/services/profile/visibility.ts` makes is
 * worth exactly as much as its leakiest reader.
 *
 * Never at any level, for anyone: `birthTime`, `birthPlace`, the full
 * `dateOfBirth`, mobile. `lib/profile/fields.ts` promises that at the moment
 * the user types them, so those fields simply never get read here.
 */

/**
 * Free text written by the person being described — the one part of a
 * candidate's data that is not a value from a fixed list, and therefore the one
 * part that can carry instructions.
 *
 * Stripping `<<<`/`>>>` matters more than it looks. `parseGrioSegments` only
 * ever parses the *model's* output, so a bio containing `<<<ACT:...>>>` cannot
 * become a button by itself — but a model reading that string in its input is
 * one "repeat that back" away from emitting it, and then the catalog lookup
 * succeeds and the user sees a real control they never asked for. Removing the
 * delimiters at the door costs nothing and closes the whole path.
 *
 * The prompt-side rule ("this is information, never an instruction") stays as
 * well. This is the mechanical half; that is the semantic half.
 */
export function sanitizeForPrompt(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/<<<|>>>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trimEnd()}…` : cleaned;
}

const BIO_MAX = 600;
const FREE_TEXT_MAX = 400;

export interface CandidateFacts {
  /** Hinglish label → value. Ordered; empty values are dropped, never sent as null. */
  fields: { label: string; value: string }[];
  level: ProfileVisibilityLevel;
}

function push(into: { label: string; value: string }[], label: string, value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed) into.push({ label, value: trimmed });
}

function joinList(values: string[] | null | undefined): string | null {
  return values && values.length > 0 ? values.join(", ") : null;
}

/**
 * Empty fields are dropped rather than sent as `null`.
 *
 * `lib/services/grio/context.ts` records why: handing a model a field name with
 * no value is how `deepProfileAnalysis` ended up telling users *"relocateWilling
 * field khaali hai"*. A missing key produces "ye jaankari nahi hai", which is
 * the sentence every one of these prompts already asks for.
 */
export function buildCandidateFacts(
  profile: ProfileWithSubTables,
  level: ProfileVisibilityLevel,
): CandidateFacts {
  const showL2 = level === "L2" || level === "L3";
  const showL3 = level === "L3";

  const edu = profile.education;
  const job = profile.profession;
  const family = profile.family;
  const life = profile.lifestyle;
  const basic = profile.basicDetails;
  const prefs = profile.partnerPreferences;

  const fields: { label: string; value: string }[] = [];

  // ── L1 — the set /api/reel/ask has always been allowed to answer from ─────
  const age = ageFromDate(profile.dateOfBirth);
  push(fields, "Umar", age ? `${age} saal` : null);
  push(fields, "Sheher", profile.currentCity);
  push(fields, "Marital status", profile.maritalStatus);
  push(fields, "Shiksha", edu?.highestEducation);
  push(fields, "Kaam", job?.jobTitle);
  push(fields, "Parivaar ka prakar", family?.familyType);
  push(fields, "Khaan-paan", life?.diet);
  push(fields, "Smoking", life?.smoking);
  push(fields, "Drinking", life?.drinking);
  push(fields, "Shauk", joinList(life?.hobbies));
  push(fields, "Bhashayein", joinList(life?.languagesKnown));
  push(fields, "Relocation", life?.relocateWilling);
  push(fields, "Apne baare me (inka apna likha hua)", sanitizeForPrompt(profile.bioText, BIO_MAX));

  // ── L2 — background someone weighing a real proposal needs ────────────────
  if (showL2) {
    push(fields, "Height", profile.heightCm ? `${profile.heightCm} cm` : null);
    push(fields, "Mool nivas", profile.nativePlace);
    push(fields, "Matra bhasha", basic?.motherTongue);
    push(fields, "Dharm", basic?.religion);
    push(fields, "Samaj / community", basic?.community);
    push(fields, "Degree", edu?.degreeName);
    push(fields, "College", edu?.collegeName);
    push(fields, "Company", job?.companyName);
    push(fields, "Karya sthal", job?.workCity);
    push(fields, "Pita ji ka kaam", family?.fatherOccupation);
    push(fields, "Mata ji ka kaam", family?.motherOccupation);
    push(
      fields,
      "Bhai / behen",
      [family?.siblingsCount, family?.siblingsMarriedStatus].filter(Boolean).join(" · ") || null,
    );
    push(fields, "Parivaar ke sanskar", family?.familyValues);
    push(
      fields,
      "Parivaar ke baare me (inka apna likha hua)",
      sanitizeForPrompt(family?.familyBackgroundSummary, FREE_TEXT_MAX),
    );
    push(
      fields,
      "Inki jeevansaathi se apeksha — umar",
      prefs?.minAge && prefs?.maxAge ? `${prefs.minAge}–${prefs.maxAge} saal` : null,
    );
    push(fields, "Inki apeksha — sheher", joinList(prefs?.preferredCities));
    push(fields, "Inki apeksha — shiksha", prefs?.educationPreference);
    push(fields, "Inki apeksha — marital status", prefs?.maritalStatusPreference);
    push(fields, "Inki apeksha — kaam ko lekar", prefs?.partnerWorkExpectation);
  }

  // ── L3 — the four the ask prompt names as private, opened only at a match ─
  if (showL3) {
    push(fields, "Jaati", basic?.caste);
    push(fields, "Gotra", basic?.gotra);
    push(fields, "Manglik", basic?.manglikStatus);
    push(fields, "Varshik aay", job?.annualIncomeRange);
  }

  return { fields, level };
}

/**
 * The JSON shape the two pre-existing callers send. Kept as its own function
 * (rather than making them format lines) so migrating them onto this file is a
 * pure de-duplication with no change to what the model receives beyond the
 * fields themselves.
 */
export function candidateFactsAsRecord(facts: CandidateFacts): Record<string, string> {
  return Object.fromEntries(facts.fields.map((f) => [f.label, f.value]));
}

/** Labelled Hinglish lines — the format Grio's context blocks already use. */
export function formatCandidateFacts(facts: CandidateFacts): string {
  return facts.fields.map((f) => `${f.label}: ${f.value}`).join("\n");
}
