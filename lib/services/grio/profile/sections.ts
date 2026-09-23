import type { CandidateFacts } from "@/lib/services/match/candidateFacts";
import type { ProfileVisibilityLevel } from "@/lib/services/profile/visibility";
import { INTELLIGENCE_QUESTION_BY_KEY } from "@/lib/profile/intelligenceQuestions";

/**
 * One profile, arranged the way a person asks about it — "family?",
 * "lifestyle?" — instead of the way the database stores it.
 *
 * Built **only** from `buildCandidateFacts` (the single answer to "what may an
 * AI know about somebody else", already cut to the viewer's L1/L2/L3 level),
 * so nothing here can widen what Grio sees. This file adds two things facts
 * alone cannot say:
 *
 *   • **missing** — fields that *would* be visible at this level and are empty.
 *     "Family details is profile me available nahi hain" is a true, useful
 *     sentence; guessing a family to fill the gap is the failure this prevents.
 *   • **locked** — fields that open at a higher level. Named generically ("mata-
 *     pita ka kaam") and never as present/absent: saying "their income is
 *     filled but locked" would itself leak something the level withholds.
 *
 * Pure: the check script builds it from fixture facts.
 */

export type ProfileSectionId =
  | "basics"
  | "education"
  | "career"
  | "family"
  | "lifestyle"
  | "values"
  | "expectations"
  | "tradition"
  | "about";

export const SECTION_TITLE: Record<ProfileSectionId, string> = {
  basics: "Ek nazar me",
  education: "Shiksha",
  career: "Kaam",
  family: "Parivaar",
  lifestyle: "Lifestyle",
  values: "Zindagi ki soch",
  expectations: "Jeevansaathi se apeksha",
  tradition: "Parampara",
  about: "Apne baare me",
};

/**
 * Every field `buildCandidateFacts` can emit, where it belongs, and the level
 * at which a viewer may see it — the same split as candidateFacts.ts and
 * profileViewData.ts. `label` is used only for the missing/locked lists.
 */
const FIELD_SPEC: Record<string, { section: ProfileSectionId; level: ProfileVisibilityLevel; label: string }> = {
  age: { section: "basics", level: "L1", label: "umar" },
  city: { section: "basics", level: "L1", label: "sheher" },
  maritalStatus: { section: "basics", level: "L1", label: "marital status" },
  height: { section: "basics", level: "L2", label: "height" },
  nativePlace: { section: "basics", level: "L2", label: "mool nivas" },
  motherTongue: { section: "basics", level: "L2", label: "matra bhasha" },
  education: { section: "education", level: "L1", label: "shiksha" },
  degree: { section: "education", level: "L2", label: "degree" },
  college: { section: "education", level: "L2", label: "college" },
  job: { section: "career", level: "L1", label: "kaam" },
  company: { section: "career", level: "L2", label: "company" },
  workCity: { section: "career", level: "L2", label: "kaam ka sheher" },
  income: { section: "career", level: "L3", label: "aay ki range" },
  familyType: { section: "family", level: "L1", label: "parivaar ka prakar" },
  fatherOccupation: { section: "family", level: "L2", label: "pita ji ka kaam" },
  motherOccupation: { section: "family", level: "L2", label: "mata ji ka kaam" },
  siblings: { section: "family", level: "L2", label: "bhai-behen" },
  familyValues: { section: "family", level: "L2", label: "parivaar ke sanskar" },
  familyAbout: { section: "family", level: "L2", label: "parivaar ke baare me unka likha" },
  diet: { section: "lifestyle", level: "L1", label: "khaan-paan" },
  smoking: { section: "lifestyle", level: "L1", label: "smoking" },
  drinking: { section: "lifestyle", level: "L1", label: "drinking" },
  hobbies: { section: "lifestyle", level: "L1", label: "shauk" },
  languages: { section: "lifestyle", level: "L1", label: "bhashayein" },
  relocation: { section: "expectations", level: "L1", label: "relocation" },
  prefAge: { section: "expectations", level: "L2", label: "partner ki umar ki apeksha" },
  prefCities: { section: "expectations", level: "L2", label: "sheher ki apeksha" },
  prefEducation: { section: "expectations", level: "L2", label: "shiksha ki apeksha" },
  prefMaritalStatus: { section: "expectations", level: "L2", label: "marital status ki apeksha" },
  prefWork: { section: "expectations", level: "L2", label: "kaam ko lekar apeksha" },
  religion: { section: "tradition", level: "L2", label: "dharm" },
  community: { section: "tradition", level: "L2", label: "samaj" },
  caste: { section: "tradition", level: "L3", label: "jaati" },
  gotra: { section: "tradition", level: "L3", label: "gotra" },
  manglik: { section: "tradition", level: "L3", label: "manglik" },
  bio: { section: "about", level: "L1", label: "apne baare me likha hua" },
};

/**
 * PROFILE_VISIBLE Marriage Intelligence answers, by where a person would look
 * for them. These are optional questions, so an unanswered one is reported as
 * "abhi nahi bataya" only for the few that genuinely change a decision.
 */
const SIGNAL_SECTION: Record<string, ProfileSectionId> = {
  marriageTimeline: "values",
  relationshipReadiness: "values",
  familyIntroductionTiming: "family",
  postMarriageLivingPlan: "family",
  careerPriority: "career",
  relocationBoundary: "expectations",
  partnerCareerExpectation: "expectations",
  sleepRhythm: "lifestyle",
  fitnessImportance: "lifestyle",
  travelStyle: "lifestyle",
  petsPreference: "lifestyle",
  ritualImportance: "values",
  traditionModernBalance: "values",
};

/**
 * The optional answers worth calling out when absent — with their own labels,
 * not the catalog's two-word ones. "Rehna kahan" on its own was read back by a
 * model as "rehne ka sheher nahi diya", a false statement about a profile whose
 * city was right there: the question is about *after marriage*, and the label
 * has to say so.
 */
const NOTABLE_SIGNALS: Record<string, string> = {
  marriageTimeline: "shaadi kab tak karni hai",
  postMarriageLivingPlan: "shaadi ke baad kahan rehna hai",
  careerPriority: "career ki priority",
};

const RANK: Record<ProfileVisibilityLevel, number> = { L1: 1, L2: 2, L3: 3 };

export interface ProfileFactView {
  key: string;
  label: string;
  value: string;
}

export interface ProfileSectionView {
  id: ProfileSectionId;
  title: string;
  facts: ProfileFactView[];
  /** Visible at this level, and empty. */
  missing: string[];
  /** Opens at a higher level. Generic names only. */
  locked: { level: "L2" | "L3"; labels: string[] }[];
}

export interface ProfileSections {
  level: ProfileVisibilityLevel;
  sections: Record<ProfileSectionId, ProfileSectionView>;
}

export function buildProfileSections(facts: CandidateFacts): ProfileSections {
  const level = facts.level;
  const empty = (id: ProfileSectionId): ProfileSectionView => ({
    id,
    title: SECTION_TITLE[id],
    facts: [],
    missing: [],
    locked: [],
  });
  const sections = Object.fromEntries(
    (Object.keys(SECTION_TITLE) as ProfileSectionId[]).map((id) => [id, empty(id)]),
  ) as Record<ProfileSectionId, ProfileSectionView>;

  const present = new Set<string>();
  for (const f of facts.fields) {
    present.add(f.key);
    if (f.key.startsWith("signal:")) {
      const signalKey = f.key.slice("signal:".length);
      const section = SIGNAL_SECTION[signalKey] ?? "values";
      sections[section].facts.push({ key: f.key, label: f.label, value: f.value });
      continue;
    }
    const spec = FIELD_SPEC[f.key];
    const section = spec?.section ?? "basics";
    sections[section].facts.push({ key: f.key, label: f.label, value: f.value });
  }

  const lockedBy = {} as Record<ProfileSectionId, Record<"L2" | "L3", string[]>>;
  for (const id of Object.keys(SECTION_TITLE) as ProfileSectionId[]) lockedBy[id] = { L2: [], L3: [] };

  for (const [key, spec] of Object.entries(FIELD_SPEC)) {
    if (RANK[spec.level] > RANK[level]) {
      lockedBy[spec.section][spec.level as "L2" | "L3"].push(spec.label);
    } else if (!present.has(key)) {
      sections[spec.section].missing.push(spec.label);
    }
  }
  for (const [key, label] of Object.entries(NOTABLE_SIGNALS)) {
    if (present.has(`signal:${key}`)) continue;
    if (INTELLIGENCE_QUESTION_BY_KEY[key]) sections[SIGNAL_SECTION[key] ?? "values"].missing.push(label);
  }

  for (const id of Object.keys(sections) as ProfileSectionId[]) {
    const l = lockedBy[id];
    sections[id].locked = (["L2", "L3"] as const).filter((lv) => l[lv].length > 0).map((lv) => ({ level: lv, labels: l[lv] }));
  }

  return { level, sections };
}

/** A section with nothing visible now — the "family details available nahi" case. */
export function sectionIsEmpty(s: ProfileSectionView): boolean {
  return s.facts.length === 0;
}

/**
 * When a locked field opens, in words that cannot be misread. L2 opens on an
 * interest in *either* direction (visibility.ts); an earlier "interest bhejne
 * (ya unka interest aane) ke baad" came back from a model as "dono taraf se
 * interest ke baad", which is L3's condition, not L2's.
 */
export const LEVEL_UNLOCK: Record<"L2" | "L3", string> = {
  L2: "aapka interest jaate hi (ya unka interest aate hi)",
  L3: "match hone par (jab dono taraf se haan ho)",
};

/** "Parivaar: …" lines for a prompt or a code-written answer. */
export function formatSection(s: ProfileSectionView, opts: { withGaps?: boolean } = {}): string {
  const lines = s.facts.map((f) => `- ${f.label}: ${f.value}`);
  if (opts.withGaps) {
    if (s.missing.length > 0) lines.push(`- (Profile me nahi diya gaya: ${s.missing.join(", ")})`);
    for (const l of s.locked) lines.push(`- (${LEVEL_UNLOCK[l.level]} dikhega: ${l.labels.join(", ")})`);
  }
  return `${s.title.toUpperCase()}:\n${lines.length > 0 ? lines.join("\n") : "- (is hisse me abhi kuch nahi dikhta)"}`;
}
