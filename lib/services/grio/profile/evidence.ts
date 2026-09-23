import { ageFromDate } from "@/lib/services/match/age";
import {
  checkDealBreakerCode,
  scoreAgeMatch,
  scoreCasteMatch,
  scoreCityMatch,
  scoreEducationMatch,
  scoreManglikMatch,
  scoreReligionMatch,
} from "@/lib/services/match/preferenceScore";
import {
  isNeutralPreference,
  preferenceEvidenceState,
  statedCities,
  statedPartnerPreferences,
} from "@/lib/services/match/preferenceEvidence";
import { buildCompatibilityReport, type AlignmentStatus } from "@/lib/services/match/compatibilityLab";
import { asList, firstValue, type SignalAnswerMap } from "@/lib/profile/signalAnswers";
import { DEAL_BREAKER_LABEL, INTELLIGENCE_QUESTION_BY_KEY, type IntelligenceLayerKey } from "@/lib/profile/intelligenceQuestions";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import type { ProfileVisibilityLevel } from "@/lib/services/profile/visibility";
import type {
  GrioEvidenceArea,
  GrioEvidenceCard,
  GrioEvidenceGroup,
  GrioEvidenceRow,
  GrioEvidenceStatus,
  GrioIntent,
} from "@/lib/contracts/grioProfile";

/**
 * "Why might this profile matter to me?" — answered by comparing real fields,
 * row by row, before any model is asked to phrase it.
 *
 * ## The one rule: this is not a second score
 *
 * Every preference row calls the *same* comparator the ranking uses
 * (`preferenceScore.ts`), and every values row is a Compatibility Lab
 * dimension, which itself wraps those comparators. So a row that says
 * "Sheher: aapki pasand Delhi — profile Delhi ✓" is the ranking's own
 * `scoreCityMatch` answering 100, restated; it cannot disagree with the ring on
 * the card. What this file adds is only the *sentence*: which two values were
 * compared, so Grio can say "Location aligns" with its evidence attached
 * instead of a magic "90% compatible".
 *
 * ## What it will not do
 *
 *  • **Compare the viewer's own caste or religion with anyone's.** Tradition
 *    fields appear only as the viewer's *explicit* partner preference
 *    ("Koi farak nahi" and blank mean the row does not exist), exactly the
 *    pattern `scorePreferenceMatch` follows — never "you are both X".
 *  • **Show what the viewer may not see.** A preference whose other side
 *    opens at L2/L3 is `locked` with the unlock condition, and the
 *    profile's value is left out entirely — the same line the profile page
 *    and `candidateFacts.ts` draw.
 *  • **Name a private answer.** Values rows use Compatibility Lab's own
 *    `detail`, which only ever names PROFILE_VISIBLE answers.
 *
 * Pure: no prisma, no AI — the check script feeds it fixture profiles.
 */

const RANK: Record<ProfileVisibilityLevel, number> = { L1: 1, L2: 2, L3: 3 };
const atLeast = (level: ProfileVisibilityLevel, min: ProfileVisibilityLevel) => RANK[level] >= RANK[min];

const LOCK_NOTE: Record<"L2" | "L3", string> = {
  L2: "Profile ki taraf ki jaankari aapka interest jaate hi (ya unka aate hi) dikhegi.",
  L3: "Profile ki taraf ki jaankari match hone par (dono taraf se haan) dikhegi.",
};

/** The ranking's 0..100 comparators, read as three plain states. */
function band(score: number): Exclude<GrioEvidenceStatus, "unknown" | "locked"> {
  if (score >= 90) return "match";
  if (score >= 60) return "partial";
  return "different";
}

function rangeText(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max} saal`;
  if (min !== null) return `${min}+ saal`;
  if (max !== null) return `${max} saal tak`;
  return "";
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function intersect(a: string[] | null | undefined, b: string[] | null | undefined): string[] {
  const theirs = new Set((b ?? []).map((x) => norm(x)).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of a ?? []) {
    const k = norm(x);
    if (k && theirs.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(x.trim());
    }
  }
  return out;
}

const AREA_OF_LAYER: Record<IntelligenceLayerKey, GrioEvidenceArea> = {
  INTENT: "values",
  FAMILY_LIFE: "family",
  CAREER: "career",
  MONEY: "values",
  CHILDREN: "family",
  LIFESTYLE: "lifestyle",
  COMMUNICATION: "values",
  VALUES: "values",
  PARTNER_PREFERENCES: "expectations",
};

const VALUES_STATUS: Record<AlignmentStatus, GrioEvidenceStatus> = {
  STRONG_ALIGNMENT: "match",
  DIFFERENT_BUT_MANAGEABLE: "partial",
  DISCUSS: "different",
  UNKNOWN: "unknown",
};

export interface ProfileEvidence {
  rows: GrioEvidenceRow[];
  /** Whether the viewer has told the app what they want at all — see preferenceEvidence.ts. */
  preferenceState: "NOT_PROVIDED" | "PARTIAL" | "COMPARABLE";
  /** Values dimensions compared / total, straight from Compatibility Lab. */
  valuesCoverage: { known: number; total: number };
}

export function buildProfileEvidence(input: {
  viewer: ProfileWithSubTables;
  candidate: ProfileWithSubTables;
  level: ProfileVisibilityLevel;
  viewerSignals: SignalAnswerMap;
  candidateSignals: SignalAnswerMap;
}): ProfileEvidence {
  const { viewer, candidate, level, viewerSignals, candidateSignals } = input;
  const prefs = viewer.partnerPreferences;
  const rows: GrioEvidenceRow[] = [];
  let comparedPreferences = 0;

  const pref = (row: Omit<GrioEvidenceRow, "kind">) => {
    rows.push({ ...row, kind: "preference" });
    if (row.status !== "unknown" && row.status !== "locked") comparedPreferences += 1;
  };

  /* ── what the viewer explicitly asked for ─────────────────────────────── */

  if (prefs?.minAge != null || prefs?.maxAge != null) {
    const theirAge = ageFromDate(candidate.dateOfBirth);
    const s = scoreAgeMatch(prefs, candidate);
    pref({
      key: "pref:age",
      area: "age",
      label: "Umar",
      status: s === null ? "unknown" : band(s),
      yours: `Aapki pasand: ${rangeText(prefs?.minAge ?? null, prefs?.maxAge ?? null)}`,
      theirs: theirAge ? `${theirAge} saal` : null,
      note: s === null ? "Profile me umar nahi di gayi." : s >= 90 ? null : "Aapki batayi umar ki range se thoda bahar.",
    });
  }

  const cities = statedCities(prefs);
  if (cities.length > 0) {
    const s = scoreCityMatch(prefs, viewer, candidate);
    const yours = cities
      .map((c) => (c === "Isi sheher me" ? `aapka hi sheher${viewer.currentCity ? ` (${viewer.currentCity})` : ""}` : c))
      .join(", ");
    pref({
      key: "pref:city",
      area: "location",
      label: "Sheher",
      status: s === null ? "unknown" : band(s),
      yours: `Aapki pasand: ${yours}`,
      theirs: candidate.currentCity?.trim() || null,
      note: s === null ? "Profile me sheher nahi diya gaya." : null,
    });
  }

  if (!isNeutralPreference(prefs?.educationPreference)) {
    const s = scoreEducationMatch(prefs, candidate);
    pref({
      key: "pref:education",
      area: "education",
      label: "Shiksha",
      status: s === null ? "unknown" : band(s),
      yours: `Aapki pasand: ${prefs?.educationPreference}`,
      theirs: candidate.education?.highestEducation?.trim() || null,
      note: s === null ? "Profile me shiksha nahi di gayi." : null,
    });
  }

  // Tradition: explicit preference only, and only at the level the profile's
  // side is visible to this viewer (religion from L2, caste/manglik at L3 —
  // candidateFacts.ts's split).
  const tradition: {
    key: string;
    label: string;
    wanted: string | null | undefined;
    min: "L2" | "L3";
    score: () => number | null;
    theirs: () => string | null;
  }[] = [
    {
      key: "pref:religion",
      label: "Dharm",
      wanted: prefs?.religionPreference,
      min: "L2",
      score: () => scoreReligionMatch(prefs, candidate),
      theirs: () => candidate.basicDetails?.religion?.trim() || null,
    },
    {
      key: "pref:caste",
      label: "Jaati / community",
      wanted: prefs?.castePreference,
      min: "L3",
      score: () => scoreCasteMatch(prefs, candidate),
      theirs: () => candidate.basicDetails?.caste?.trim() || null,
    },
    {
      key: "pref:manglik",
      label: "Manglik",
      wanted: prefs?.manglikPreference,
      min: "L3",
      score: () => scoreManglikMatch(prefs, candidate),
      theirs: () => candidate.basicDetails?.manglikStatus?.trim() || null,
    },
  ];
  for (const t of tradition) {
    if (isNeutralPreference(t.wanted)) continue;
    if (!atLeast(level, t.min)) {
      pref({
        key: t.key,
        area: "tradition",
        label: t.label,
        status: "locked",
        yours: `Aapki pasand: ${t.wanted}`,
        theirs: null,
        note: LOCK_NOTE[t.min],
      });
      continue;
    }
    const s = t.score();
    pref({
      key: t.key,
      area: "tradition",
      label: t.label,
      status: s === null ? "unknown" : band(s),
      yours: `Aapki pasand: ${t.wanted}`,
      theirs: t.theirs(),
      note: s === null ? "Profile me ye nahi diya gaya." : null,
    });
  }

  // Non-negotiables whose other side is plain profile data the viewer can
  // already see. The ones that rest on the profile's MATCH_PRIVATE answers
  // (children, living, family involvement) are Compatibility Lab's to state,
  // in its privacy-safe words, below.
  const codes = asList(viewerSignals.get("dealBreakerCodes")?.value);
  const LIFESTYLE_CODES: Record<string, { area: GrioEvidenceArea; theirs: () => string | null; min: ProfileVisibilityLevel }> = {
    NO_SMOKING: { area: "lifestyle", theirs: () => candidate.lifestyle?.smoking ?? null, min: "L1" },
    NO_DRINKING: { area: "lifestyle", theirs: () => candidate.lifestyle?.drinking ?? null, min: "L1" },
    DIET: { area: "lifestyle", theirs: () => candidate.lifestyle?.diet ?? null, min: "L1" },
    NO_RELOCATION: { area: "location", theirs: () => candidate.lifestyle?.relocateWilling ?? null, min: "L1" },
  };
  for (const code of codes) {
    const spec = LIFESTYLE_CODES[code];
    if (!spec) continue;
    const verdict = checkDealBreakerCode(code, viewer, candidate, viewerSignals, candidateSignals);
    // A null with the profile's side present means the check had nothing to
    // test on the *viewer's* side (a DIET rule from someone whose own diet is
    // not vegetarian) — not that the profile left anything out.
    if (verdict === null && spec.theirs()) continue;
    pref({
      key: `pref:dealbreaker:${code}`,
      area: spec.area,
      label: `Non-negotiable: ${DEAL_BREAKER_LABEL[code] ?? code}`,
      status: verdict === null ? "unknown" : verdict ? "different" : "match",
      yours: "Aapke liye zaroori",
      theirs: spec.theirs(),
      note: verdict === null ? "Is par profile me jaankari nahi hai." : verdict ? "Ye aapke non-negotiable se nahi milta." : null,
    });
  }

  /* ── what the two of them simply have in common ───────────────────────── */

  const common = (row: Omit<GrioEvidenceRow, "kind">) => rows.push({ ...row, kind: "common" });

  const myCity = viewer.currentCity?.trim();
  const theirCity = candidate.currentCity?.trim();
  if (myCity && theirCity) {
    const same = norm(myCity) === norm(theirCity);
    common({
      key: "common:city",
      area: "location",
      label: "Rehne ka sheher",
      status: same ? "match" : "different",
      yours: `Aap: ${myCity}`,
      theirs: theirCity,
      note: same ? "Dono ek hi sheher me hain." : null,
    });
  }

  const sameValue = (key: string, area: GrioEvidenceArea, label: string, mine?: string | null, theirs?: string | null) => {
    if (!mine?.trim() || !theirs?.trim()) return;
    const same = norm(mine) === norm(theirs);
    common({ key, area, label, status: same ? "match" : "different", yours: `Aap: ${mine.trim()}`, theirs: theirs.trim(), note: null });
  };
  sameValue("common:diet", "lifestyle", "Khaan-paan", viewer.lifestyle?.diet, candidate.lifestyle?.diet);
  sameValue("common:smoking", "lifestyle", "Smoking", viewer.lifestyle?.smoking, candidate.lifestyle?.smoking);
  sameValue("common:drinking", "lifestyle", "Drinking", viewer.lifestyle?.drinking, candidate.lifestyle?.drinking);
  sameValue("common:familyType", "family", "Parivaar ka prakar", viewer.family?.familyType, candidate.family?.familyType);

  const myHobbies = viewer.lifestyle?.hobbies ?? [];
  const theirHobbies = candidate.lifestyle?.hobbies ?? [];
  if (myHobbies.length > 0 && theirHobbies.length > 0) {
    const shared = intersect(myHobbies, theirHobbies);
    common({
      key: "common:hobbies",
      area: "lifestyle",
      label: "Shauk",
      status: shared.length > 0 ? "match" : "different",
      yours: `Aap: ${myHobbies.join(", ")}`,
      theirs: theirHobbies.join(", "),
      note: shared.length > 0 ? `Dono ko pasand: ${shared.join(", ")}` : "List me koi common shauk nahi mila.",
    });
  }

  const sharedLanguages = intersect(viewer.lifestyle?.languagesKnown, candidate.lifestyle?.languagesKnown);
  if (sharedLanguages.length > 0) {
    common({
      key: "common:languages",
      area: "lifestyle",
      label: "Bhasha",
      status: "match",
      yours: `Aap: ${(viewer.lifestyle?.languagesKnown ?? []).join(", ")}`,
      theirs: (candidate.lifestyle?.languagesKnown ?? []).join(", "),
      note: `Dono bolte hain: ${sharedLanguages.join(", ")}`,
    });
  }

  /* ── values: Compatibility Lab, verbatim ──────────────────────────────── */

  const report = buildCompatibilityReport(viewer, candidate, viewerSignals, candidateSignals);
  for (const d of report.dimensions) {
    const q = INTELLIGENCE_QUESTION_BY_KEY[d.key];
    const mine = firstValue(viewerSignals.get(d.key)?.value);
    const theirKey = d.key === "partnerCareerExpectation" ? "careerPriority" : d.key;
    const theirs = d.candidateAnswerIsPrivate ? null : (firstValue(candidateSignals.get(theirKey)?.value) ?? null);
    rows.push({
      key: `values:${d.key}`,
      area: q ? AREA_OF_LAYER[q.layer] : "values",
      label: d.label,
      kind: "values",
      status: VALUES_STATUS[d.status],
      yours: mine ? `Aap: ${mine}` : null,
      theirs,
      note: d.detail,
    });
  }

  // The same "has this person said what they want" answer the reel and the fit
  // card use — a row existing is not a preference (preferenceEvidence.ts).
  const stated = statedPartnerPreferences(viewer, viewerSignals).length;
  return {
    rows,
    preferenceState: stated === 0 ? "NOT_PROVIDED" : preferenceEvidenceState(stated, comparedPreferences),
    valuesCoverage: report.coverage,
  };
}

/* ------------------------------------------------------------------ */
/* Choosing what to show for a question                                 */
/* ------------------------------------------------------------------ */

const KIND_ORDER: Record<GrioEvidenceRow["kind"], number> = { preference: 0, common: 1, values: 2 };

function sorted(rows: GrioEvidenceRow[]): GrioEvidenceRow[] {
  return [...rows].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

/**
 * A values dimension neither of them has answered is not worth a line — there
 * are thirty of those on a fresh pair, and listing them buries the three that
 * matter. The useful unknowns are the ones with *one* side answered.
 */
function usefulUnknown(r: GrioEvidenceRow): boolean {
  if (r.kind !== "values") return true;
  return Boolean(r.yours) || r.status === "locked";
}

export interface SelectedEvidence {
  similar: GrioEvidenceRow[];
  different: GrioEvidenceRow[];
  unknown: GrioEvidenceRow[];
}

/**
 * The rows a given question is about, capped so a card stays a card. Similar
 * first by kind (what the viewer asked for, then plain common ground, then
 * values), because "your preference matches" is the strongest evidence a
 * member can check for themselves.
 */
export function selectEvidence(rows: GrioEvidenceRow[], intent: GrioIntent, maxPerGroup = 4): SelectedEvidence {
  const areaFilter: Partial<Record<GrioIntent, GrioEvidenceArea[]>> = {
    PROFILE_FAMILY: ["family"],
    PROFILE_LIFESTYLE: ["lifestyle"],
  };
  const areas = areaFilter[intent];
  const pool = areas ? rows.filter((r) => areas.includes(r.area)) : rows;

  const similar = sorted(pool.filter((r) => r.status === "match"));
  const different = sorted(pool.filter((r) => r.status === "different" || r.status === "partial"));
  const unknown = sorted(pool.filter((r) => (r.status === "unknown" || r.status === "locked") && usefulUnknown(r)));

  if (intent === "PROFILE_COMPARE") {
    return { similar: similar.slice(0, 6), different: [], unknown: unknown.slice(0, 2) };
  }
  if (intent === "PROFILE_DIFFERENCE") {
    return { similar: [], different: different.slice(0, 6), unknown: unknown.slice(0, 2) };
  }
  return {
    similar: similar.slice(0, maxPerGroup),
    different: different.slice(0, maxPerGroup),
    unknown: unknown.slice(0, Math.max(2, maxPerGroup - 1)),
  };
}

const GROUP_LABEL: Record<GrioEvidenceGroup["status"], string> = {
  match: "Milta hai",
  different: "Alag hai",
  unknown: "Abhi pata nahi",
};

export function evidenceCard(
  selected: SelectedEvidence,
  opts: { title: string; preferenceState: ProfileEvidence["preferenceState"] },
): GrioEvidenceCard | null {
  const groups: GrioEvidenceGroup[] = [];
  if (selected.similar.length > 0) groups.push({ status: "match", label: GROUP_LABEL.match, rows: selected.similar });
  if (selected.different.length > 0) groups.push({ status: "different", label: GROUP_LABEL.different, rows: selected.different });
  if (selected.unknown.length > 0) groups.push({ status: "unknown", label: GROUP_LABEL.unknown, rows: selected.unknown });
  if (groups.length === 0) return null;
  return {
    title: opts.title,
    groups,
    footnote:
      opts.preferenceState === "NOT_PROVIDED"
        ? "Aapne partner preference abhi nahi batayi — isliye 'aapki pasand' wali tulna nahi ho saki, sirf common baatein."
        : null,
  };
}

/**
 * One line per row, for the prompt — both sides, the status, and *what kind of
 * comparison it is*, spelled out.
 *
 * The kind is written into every line because a model kept turning "you are
 * both from nuclear families" into "this matches your preference": the row
 * said `Aap: Nuclear family`, and to a model "aap" next to a match reads like
 * something the user asked for. The words "aapki pasand" now appear only on
 * rows that really are the user's stated preference.
 */
export function formatEvidenceForPrompt(selected: SelectedEvidence): string {
  const KIND: Record<GrioEvidenceRow["kind"], string> = {
    preference: "user ki batayi PASAND se tulna",
    common: "dono ki APNI jaankari — ye pasand nahi hai",
    values: "zindagi ki soch ka sawaal",
  };
  const line = (r: GrioEvidenceRow) => {
    const status =
      r.status === "match"
        ? "MATCH"
        : r.status === "partial"
          ? "THODA ALAG"
          : r.status === "different"
            ? "ALAG"
            : r.status === "locked"
              ? "LOCKED"
              : "PATA NAHI";
    const mine = r.yours
      ? r.kind === "preference"
        ? r.yours.replace(/^Aapki pasand:\s*/, "user ki pasand: ")
        : r.yours.replace(/^Aap:\s*/, "user khud: ")
      : null;
    const sides = [mine, r.theirs ? `ye profile: ${r.theirs}` : null].filter(Boolean).join("; ");
    return `- [${status}] ${r.label} (${KIND[r.kind]})${sides ? ` — ${sides}` : ""}${r.note ? ` [${r.note}]` : ""}`;
  };
  const blocks: string[] = [];
  if (selected.similar.length > 0) blocks.push(`Milta hai:\n${selected.similar.map(line).join("\n")}`);
  if (selected.different.length > 0) blocks.push(`Alag hai:\n${selected.different.map(line).join("\n")}`);
  if (selected.unknown.length > 0) blocks.push(`Abhi pata nahi / locked:\n${selected.unknown.map(line).join("\n")}`);
  return blocks.join("\n\n");
}
