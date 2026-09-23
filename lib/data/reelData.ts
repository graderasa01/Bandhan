import { prisma } from "@/lib/db/prisma";
import { extendTodayReel, getOrCreateTodayReel } from "@/lib/services/match/reelGenerator";
import { ageFromDate } from "@/lib/services/match/age";
import {
  canUsePhotoEnhance,
  canUsePhotoUltraEnhance,
  isFeatureAvailable,
} from "@/lib/services/plans/entitlements";
import { canViewerUnlockPhotos, photoLockFor } from "@/lib/services/plans/photoAccess";
import type { PhotoLock } from "@/lib/contracts/photoLock";
import { getActiveQuests } from "@/lib/services/quests/questService";
import { getLaneCounts } from "@/lib/data/reelLibraryData";
import { getSeenDeckPage } from "@/lib/data/reelSeenDeck";
import { computeCompletion } from "@/lib/services/profile/completionService";
import { profileGapsFrom } from "@/lib/reel/profileGaps";
import { getLikeStates } from "@/lib/services/library/likeService";
import { getKundliNotes } from "@/lib/services/kundli/kundliService";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { getPublicParentBlessings, type PublicParentBlessingView } from "@/lib/services/family/blessingService";
import { buildPhotoSlides } from "@/lib/services/profile/photoSlides";
import { PROFILE_FIELDS } from "@/lib/profile/fields";
import { getVibeBadgesForUsers, type VibeBadgeView } from "@/lib/services/vibe/pollService";
import { getAskedStatusMap } from "@/lib/services/askBridge/profileQuestionService";
import { selectMissionEligible, buildMissionHeadline } from "@/lib/services/match/missionService";
import { loadMatchSignals, scoreCandidates, type ScoredCandidate } from "@/lib/services/match/pipeline";
import { buildCompatibilityReport } from "@/lib/services/match/compatibilityLab";
import { type MatchSignals } from "@/lib/services/match/sochFit";
import { buildCandidateFacts } from "@/lib/services/match/candidateFacts";
import { buildWhyThisMatch } from "@/lib/services/match/whyThisMatch";
import { candidateSummary, explanationFingerprint } from "@/lib/services/match/explain";
import { assessPartnerPreferences } from "@/lib/services/match/preferenceEvidence";
import { milanBetween, milanIsApproximate } from "@/lib/services/kundli/kundliMatch";
import { effectiveSignals } from "@/lib/profile/signalAnswers";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { noopT, type Translate } from "@/lib/i18n/translate";
import type {
  ReelCardKundli,
  ReelCardPreference,
  ReelCardViewModel,
  ReelFact,
  ReelPreferenceNotice,
  ReelRefineQuestion,
  ReelSwipeDirection,
  ReelViewModel,
} from "@/lib/contracts/reel";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import type { ProfileQuestionStatus } from "@prisma/client";

type ReelWithCandidates = Awaited<ReturnType<typeof getOrCreateTodayReel>>;
type ReelCandidate = ReelWithCandidates["candidates"][number];

/**
 * The viewer's full profile — the same shape `getCompatibilityReport` loads,
 * because the "Why this match?" layer reuses that exact comparison. It is read
 * on the server only: nothing of it reaches the card except the deterministic
 * overlap chips, the gotra/manglik notes and a guna-milan *summary* (a total
 * and a band — conclusions, never the birth details). birthTime/birthPlace
 * are loaded with the row and never leave this function — the profile
 * builder promises they are "sirf kundli ke liye".
 */
type ViewerLite = ProfileWithSubTables | null;

/** Facts the details sheet groups — header fields and the bio are left out (see the contract). */
const SHEET_FACT_GROUPS = new Set<ReelFact["group"]>(["family", "lifestyle", "expectation"]);

/*
 * `NEW_PROFILE_WINDOW_DAYS` was here — thirty days from `Profile.createdAt`,
 * which is what the "New" lens used to mean. D-92 replaced it with
 * `seenBefore`: on a screen where every tab is a cut of one feed, "naye" means
 * the people this member has not met yet, not the people who happened to
 * register this month. The join date answered a question nobody was asking
 * here, and it made the lens go empty for a member whose matches are all older
 * accounts.
 */


/**
 * The partner-preference questions the end-of-batch refinement may ask, in the
 * order it asks them.
 *
 * Read from `PROFILE_FIELDS` rather than restated, so a wording change in the
 * catalog reaches this screen too, and so an option list can never drift from
 * the one the manual deck and the interview offer. Order is what a stranger
 * would answer most readily first: where, then how old, then work and study,
 * then the two the app is most careful about (religion, manglik) last.
 *
 * `partnerCastePreference` is deliberately absent. It is a free-text field —
 * there is no chip row to tap — and D-33's rule is that caste only ever enters
 * matching when the user reaches for it themselves. A reel that ends by asking
 * for it would be reaching on their behalf.
 */
const REFINE_FIELDS: { key: string; answered: (p: NonNullable<ViewerLite>["partnerPreferences"]) => boolean }[] = [
  { key: "partnerCityPreference", answered: (p) => Boolean(p?.preferredCities?.length) },
  { key: "partnerAgeRange", answered: (p) => Boolean(p?.minAge && p?.maxAge) },
  { key: "partnerWorkExpectation", answered: (p) => Boolean(p?.partnerWorkExpectation) },
  { key: "partnerEducation", answered: (p) => Boolean(p?.educationPreference) },
  { key: "partnerReligionPreference", answered: (p) => Boolean(p?.religionPreference) },
  { key: "partnerManglikPreference", answered: (p) => Boolean(p?.manglikPreference) },
];

/** At most this many, however many are empty — the card asks, it does not interview. */
const MAX_REFINE_QUESTIONS = 4;

/**
 * What the viewer has *not* told us yet, phrased as the catalog phrases it.
 *
 * Each key is paired with the column that holds its answer rather than routed
 * through `profileTablesToDraftValues`: that function answers a different
 * question (what would the manual deck prefill?) and reaching for it here would
 * mean the reel's idea of "already answered" could drift from the deck's the
 * next time either side grows a field.
 */
function refineQuestionsFor(viewer: ViewerLite): ReelRefineQuestion[] {
  if (!viewer) return [];
  const prefs = viewer.partnerPreferences;
  const out: ReelRefineQuestion[] = [];
  for (const { key, answered } of REFINE_FIELDS) {
    if (answered(prefs)) continue;
    const def = PROFILE_FIELDS.find((f) => f.key === key);
    if (!def?.options?.length) continue;
    out.push({ key, question: def.question, options: def.options, multi: def.type === "multiselect" });
    if (out.length === MAX_REFINE_QUESTIONS) break;
  }
  return out;
}

/**
 * Deterministic viewer↔candidate field overlap, shown as floating chips on
 * the card. Deliberately not AI-generated (D-32: AI explains, code decides
 * facts) — this is the same visibility-safe field set already used by
 * `explain.ts`/`reel/ask`, just diffed against the viewer instead of prosed.
 */
/**
 * "Same city", as a person would answer it.
 *
 * `currentCity` is free text typed by two different people, so "Delhi" and
 * "delhi " are the same place and a `===` says they are not. The reel's
 * Nearby lens and this chip have to agree — a card that appears under Nearby
 * without carrying the chip reads as a bug — so both go through here.
 */
function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function computeSharedTags(
  viewer: ViewerLite,
  candidate: ReelCandidate["profile"],
  t: Translate = noopT,
): string[] {
  if (!viewer) return [];
  const tags: string[] = [];

  if (sameCity(viewer.currentCity, candidate.currentCity)) {
    tags.push(`${t("matchReel.sharedTag.sameCity", "Same city")}: ${candidate.currentCity}`);
  }

  const viewerDiet = viewer.lifestyle?.diet;
  const candidateDiet = candidate.lifestyle?.diet;
  if (viewerDiet && candidateDiet && viewerDiet === candidateDiet) {
    tags.push(`${t("matchReel.sharedTag.bothDiet", "Dono")} ${candidateDiet}`);
  }

  const viewerHobbies = viewer.lifestyle?.hobbies ?? [];
  const candidateHobbies = candidate.lifestyle?.hobbies ?? [];
  const commonHobby = viewerHobbies.find((h) => candidateHobbies.includes(h));
  if (commonHobby) tags.push(`${t("matchReel.sharedTag.commonHobby", "Common hobby")}: ${commonHobby}`);

  return tags.slice(0, 3);
}

/**
 * What to say, built from the overlap the card already shows.
 *
 * Deterministic on purpose (D-32). The hard part of recording ten seconds for
 * a stranger is the first sentence, and a template that names a real shared
 * detail solves it — while an AI-written opener would be one more thing that
 * could invent a fact neither profile stated.
 */
function buildMissionSuggestion(sharedTags: string[], strengths: string[], t: Translate = noopT): string {
  const hobby = sharedTags.find((tag) => tag.startsWith("Common hobby: "));
  if (hobby) {
    return `${t("matchReel.mission.suggestHobby.prefix", "Bataiye ki aapko bhi")} ${hobby.replace("Common hobby: ", "")} ${t("matchReel.mission.suggestHobby.suffix", "pasand hai.")}`;
  }
  const city = sharedTags.find((tag) => tag.startsWith("Same city: "));
  if (city) {
    return `${t("matchReel.mission.suggestCity.prefix", "Bataiye ki aap dono ek hi sheher me hain —")} ${city.replace("Same city: ", "")}.`;
  }
  const diet = sharedTags.find((tag) => tag.startsWith("Dono "));
  if (diet) return t("matchReel.mission.suggestDiet", "Bataiye ki aap dono ki diet ek jaisi hai.");
  if (strengths[0]) {
    return `${t("matchReel.mission.suggestStrength.prefix", "Bataiye ki inki ye baat achhi lagi —")} ${strengths[0].toLowerCase()}.`;
  }
  return t("matchReel.mission.suggestGeneric", "Bataiye ki inki profile me kya baat achhi lagi.");
}

/**
 * Where the "2 pasand batayein" CTA sends the viewer: the targeted manual deck
 * with exactly the two fields the prompt promises, back to the reel when done.
 * Same `fields=`/`return=` contract `kundliLinks.ts` uses.
 */
export const PREFERENCE_DECK_HREF = "/profile/build?mode=manual&fields=partnerAgeRange,partnerCityPreference&return=/user/reel";

function preferenceNoticeFor(viewer: ViewerLite, signals: MatchSignals, t: Translate): ReelPreferenceNotice | null {
  if (!viewer) return null;
  const { state } = assessPartnerPreferences(viewer, effectiveSignals(viewer, signals.signalAnswers?.get(viewer.id)));
  if (state === "COMPARABLE") return null;
  return state === "NOT_PROVIDED"
    ? {
        state,
        title: t("matchReel.preferenceNotice.notProvided.title", "Aapne partner preferences abhi nahi batayi hain."),
        body: t(
          "matchReel.preferenceNotice.notProvided.body",
          "Ye general suggestions hain — preference match calculate nahi hua. Ye batane se aapke rishte zyada relevant honge.",
        ),
        ctaLabel: t("matchReel.preferenceNotice.cta", "2 pasand batayein"),
        ctaHref: PREFERENCE_DECK_HREF,
      }
    : {
        state,
        title: t("matchReel.preferenceNotice.partial.title", "Aapki ek pasand pata hai — bharosemand tulna ke liye ek aur chahiye."),
        body: t(
          "matchReel.preferenceNotice.partial.body",
          "Abhi profiles general suggestions ki tarah dikh rahi hain. Partner ki umar aur sheher bata dein to preference match ban paayega.",
        ),
        ctaLabel: t("matchReel.preferenceNotice.cta", "2 pasand batayein"),
        ctaHref: PREFERENCE_DECK_HREF,
      };
}

/**
 * The viewer's own age range, as they stated it — "26–30", "26+", "30 tak".
 * Null when they stated neither bound.
 */
function statedAgeLabel(min: number | null, max: number | null, t: Translate): string | null {
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `${min}+`;
  // A whole phrase rather than a stitched-on word: "30 tak" and "up to 30" put
  // the number on opposite sides, and a translated suffix cannot fix that.
  if (max !== null) return t("matchReel.card.ageUpTo", "{max} tak").replace("{max}", String(max));
  return null;
}

/**
 * Said out loud: this card is outside the age range the viewer asked for.
 *
 * `getCandidates` drops the age preference whenever the strict pool cannot
 * fill a batch — quietly, and on the member's behalf. That widening is the
 * right call (an empty deck helps nobody) but doing it without saying so is
 * not: somebody who asked for 26–30 and is handed a 35-year-old reads it as
 * the app not listening, which is the exact feeling this screen cannot
 * afford. So the card says which of their own filters was loosened, and why.
 *
 * Computed from the live profiles rather than from a "widened" flag on the
 * reel row: the row records what was dealt, not what was true, and a member
 * who widens their range tomorrow would otherwise keep reading this line on
 * cards that now sit comfortably inside it.
 */
function outsideStatedAge(viewer: ViewerLite, candidate: ProfileWithSubTables, t: Translate): string | null {
  const min = viewer?.partnerPreferences?.minAge ?? null;
  const max = viewer?.partnerPreferences?.maxAge ?? null;
  if (min === null && max === null) return null;
  const age = ageFromDate(candidate.dateOfBirth);
  if (age === null) return null;
  if ((min === null || age >= min) && (max === null || age <= max)) return null;
  const label = statedAgeLabel(min, max, t);
  return t(
    "matchReel.card.preferenceWidened",
    "Aapki batayi umar ({range}) se bahar — aapki range me abhi koi aur nahi tha, isliye ye dikhaya.",
  ).replace("{range}", label ?? "");
}

function preferenceFor(
  scored: ScoredCandidate | null,
  viewer: ViewerLite,
  candidate: ProfileWithSubTables,
  t: Translate,
): ReelCardPreference {
  if (!scored) return { state: "NOT_PROVIDED", score: null, note: null };
  const { state, score } = scored.preference;
  // The widened line wins whenever it applies: it is the one that explains why
  // this person is on screen at all, and "data kam hai" next to a card the app
  // itself reached outside the filter for would be the less useful half of the
  // truth.
  const widened = outsideStatedAge(viewer, candidate, t);
  if (state === "COMPARABLE") return { state, score, note: widened };
  return {
    state,
    score: null,
    note:
      widened ??
      (state === "NOT_PROVIDED"
        ? t("matchReel.card.preferenceNotProvided", "General suggestion — preference match calculate nahi hua.")
        : t("matchReel.card.preferencePartial", "Aapki pasand se tulna ke liye is profile par data kam hai.")),
  };
}

/**
 * Guna milan for the details sheet — a total only when it would be the same
 * total a pandit with both birth times would compute. Both dates alone give a
 * Moon from local noon, which is "approximate" and can change nakshatra; that
 * case gets the honest sentence, not a number that looks final.
 */
export function kundliFor(viewer: ViewerLite, candidate: ProfileWithSubTables, t: Translate): ReelCardKundli {
  const notes = viewer
    ? getKundliNotes(
        { gotra: viewer.basicDetails?.gotra, manglikStatus: viewer.basicDetails?.manglikStatus },
        { gotra: candidate.basicDetails?.gotra, manglikStatus: candidate.basicDetails?.manglikStatus },
        t,
      )
    : [];
  if (!viewer) return { milan: null, note: null, notes };

  const incomplete = t(
    "matchReel.kundli.incomplete",
    "Guna Milan ke liye janm-jaankari poori nahi hai — score nahi banaya gaya.",
  );
  if (!viewer.dateOfBirth || !candidate.dateOfBirth) return { milan: null, note: incomplete, notes };
  if (milanIsApproximate(viewer) || milanIsApproximate(candidate)) {
    return {
      milan: null,
      note: t(
        "matchReel.kundli.approximate",
        "Birth time ke bina Guna Milan approximate rehta hai — dono ka janm samay hone par hi score banta hai.",
      ),
      notes,
    };
  }
  const milan = milanBetween(viewer, candidate, t);
  if (!milan) return { milan: null, note: incomplete, notes };
  return {
    milan: { total: milan.total, max: 36, band: milan.band, tone: milan.bandTone, headline: milan.headline },
    note: null,
    notes,
  };
}

function toCard(
  candidate: CardSource,
  photoLocks: Map<string, PhotoLock>,
  viewer: ViewerLite,
  missionAllowed: boolean,
  vibeBadges: Map<string, VibeBadgeView>,
  askedStatuses: Map<string, ProfileQuestionStatus>,
  blessings: Map<string, PublicParentBlessingView>,
  signals: MatchSignals,
  /**
   * What has already happened between this viewer and each card (D-92): a key
   * exists for everybody who has been on screen before, and its value is the
   * last real decision, or null for "seen, nothing decided".
   */
  history: Map<string, Exclude<ReelSwipeDirection, "UP"> | null>,
  /** userId → the `Match` these two already have (D-92b). */
  matchIds: Map<string, string>,
  t: Translate = noopT,
): Omit<ReelCardViewModel, "liked" | "shortlisted" | "interestSent"> {
  const p = candidate.profile;
  // The same values-only engine the member's own dashboard reads, so the
  // number on this card is the number on theirs. Sync and provenance-blind —
  // cheap enough to run for every card in a batch.
  const completion = computeCompletion(p);
  const primaryPhoto = p.photos.find((ph) => ph.isPrimary) ?? p.photos[0];
  // A profile the gate never looked at stays closed rather than open.
  const photoLock = photoLocks.get(p.id) ?? "match_only";
  const unlocked = photoLock === "open";
  const sharedTags = computeSharedTags(viewer, p, t);

  // Scored again, now, from the profiles as they are — not read back from
  // the row `getOrCreateTodayReel` wrote this morning. The persisted numbers
  // fixed the *order* of today's reel; what the card claims about the pair
  // has to be true of the pair as it stands. That is also what retires any
  // older row still carrying a "100% preferences" that was never computed:
  // the display state is decided by the current preference evidence, never
  // by a stored score.
  const scored = viewer ? scoreCandidates(viewer, [p], signals)[0] ?? null : null;
  const preference = preferenceFor(scored, viewer, p, t);
  const rankScore = scored && scored.hasPersonalEvidence ? Math.round(scored.finalScore) : null;

  // The AI's cached reasoning is shown only while it still describes these
  // two profiles. `aiFactsHash` fingerprints exactly what the model was
  // shown; a profile edit since then changes the hash and the block is
  // omitted rather than presented as a current fact. Rows written before
  // the hash existed have no way to prove freshness and are treated as stale.
  const aiFresh =
    Boolean(viewer && candidate.aiFactsHash) &&
    candidate.aiFactsHash === explanationFingerprint(candidateSummary(viewer as ProfileWithSubTables), candidateSummary(p));
  const strengths = aiFresh && candidate.aiReasonText ? candidate.aiReasonText.split(" • ") : [];
  const concern = aiFresh ? candidate.aiConcernText : null;

  // "Why this match?" — pure TS over data already loaded, no AI call (D-32).
  // The candidate's signals go through `buildCandidateFacts`, which keeps only
  // PROFILE_VISIBLE answers; the compatibility report may *use* MATCH_PRIVATE
  // answers but `buildWhyThisMatch` refuses to surface those dimensions on a
  // pre-match card even in derived form.
  const candidateSignals = effectiveSignals(p, signals.signalAnswers?.get(p.id));
  const facts = buildCandidateFacts(p, "L1", candidateSignals);
  const report = viewer
    ? buildCompatibilityReport(viewer, p, effectiveSignals(viewer, signals.signalAnswers?.get(viewer.id)), candidateSignals)
    : null;
  const whyThisMatch = buildWhyThisMatch(
    {
      candidateName: p.displayName ?? "",
      report,
      sochFit: scored?.sochFit ?? null,
      strengths,
      sharedTags,
      preference: { state: preference.state, score: preference.score },
      facts,
    },
    t,
  );

  const segments: ReelCardViewModel["segments"] = [];
  if (preference.state === "COMPARABLE" && preference.score !== null) {
    segments.push({
      key: "preference",
      label: t("matchReel.segment.preference", "Preferences"),
      value: preference.score,
      color: "#C9A96E",
    });
  }
  // Absent, not zero, when this pair shares no thinking data at all. Named
  // "Soch Fit" rather than "Deep Fit" since sochFit.ts widened it: it now
  // blends poll answers and the mindset trio with the AI dimensions, so
  // "Deep Fit" would credit the analysis for a number the user's own poll
  // answers largely produced.
  if (scored?.sochFit) {
    segments.push({
      key: "deepFit",
      label: t("matchReel.segment.deepFit", "Soch Fit"),
      value: Math.round(scored.sochFit.score),
      color: "#2456C9",
    });
  }
  segments.push(
    {
      key: "trust",
      label: t("matchReel.segment.trust", "Trust"),
      value: Math.round(scored?.trustScoreFactor ?? candidate.trustScoreFactor),
      color: "#1F7A5A",
    },
    {
      key: "activity",
      label: t("matchReel.segment.activity", "Activity"),
      value: Math.round(scored?.recentActivityScore ?? candidate.recentActivityScore),
      color: "#7A1F2B",
    },
  );

  return {
    id: p.id,
    displayName: p.displayName ?? t("matchReel.card.fallbackName", "Profile"),
    age: ageFromDate(p.dateOfBirth),
    city: p.currentCity,
    education: p.education?.highestEducation ?? null,
    profession: p.profession?.jobTitle ?? null,
    verified: primaryPhoto?.verificationStatus === "APPROVED",
    mobileVerified: Boolean(p.user?.mobileVerifiedAt),
    trustScore: p.trustScore,
    // Trust-by-design (§3): locked until a real mutual match exists — and
    // "locked" has to mean the URL is absent, not merely covered. Files under
    // `public/uploads/**` are served statically with no auth, so a URL that
    // ships with a lock icon over it is readable by anyone who opens
    // view-source. The card gets an address only when the gate is open.
    photoUrl: unlocked ? (primaryPhoto?.fileUrl ?? null) : null,
    photoUnlocked: unlocked,
    photoLock,
    // Carried by the delivery row, never by the person (SPOTLIGHT_LABEL).
    spotlight: Boolean(candidate.spotlightDelivery),
    photoFocalY: unlocked ? (primaryPhoto?.focalY ?? null) : null,
    // Same withheld-not-hidden rule as photoUrl: a locked card gets an empty
    // array, not slide URLs covered by a lock icon over static uploads.
    slides: unlocked ? buildPhotoSlides(p.photos) : [],
    bioNote: unlocked ? p.bioText?.trim() || null : null,
    // Not behind the photo gate: the blessing follows *profile* visibility, the
    // rule `mediaAccess.ts` enforces on every byte of it. Copying the photo
    // gate on top would be a second, stricter rule invented here — and the
    // stream would allow what the card refused to offer, which is the kind of
    // disagreement `photoAccess.ts`'s header exists to prevent.
    voiceNote: blessings.get(p.userId) ?? null,
    nearby: sameCity(viewer?.currentCity, p.currentCity),
    // A key, not a truthy value: "seen and decided nothing" is stored as null.
    seenBefore: history.has(p.id),
    lastDecision: history.get(p.id) ?? null,
    matchId: matchIds.get(p.userId) ?? null,
    rankScore,
    segments,
    preference,
    strengths,
    concern,
    sharedTags,
    // Display-only. Never fed back into scoring — see kundliService's header.
    kundli: kundliFor(viewer, p, t),
    // The floor/cap check already happened in getReelData (via
    // selectMissionEligible) — missionAllowed alone is the full answer here.
    // A mission needs a real number to lead with; `selectMissionEligible`
    // already guarantees personal evidence, so `rankScore` is set here.
    mission:
      // Never on a paid card: a mission reads as the app's own endorsement.
      missionAllowed && rankScore !== null && !candidate.spotlightDelivery
        ? {
            headline: buildMissionHeadline(rankScore, t),
            suggestion: buildMissionSuggestion(sharedTags, strengths, t),
          }
        : null,
    vibeBadge: vibeBadges.get(p.userId) ?? null,
    completeness: {
      percent: completion.fullPercent,
      gaps: profileGapsFrom(completion.missingFullFields.map((f) => f.key)),
    },
    askedStatus: askedStatuses.get(p.userId) ?? "NONE",
    whyThisMatch,
    facts: facts.fields
      .filter((f) => SHEET_FACT_GROUPS.has(f.group))
      .map((f) => ({ group: f.group, label: f.label, value: f.value })),
  };
}

/**
 * The per-read half of a reel card: everything that is true *now* rather than
 * at generation — the photo gate, live matches, vibe badges, asked status,
 * blessings and the re-scored ring.
 *
 * Shared by the page load and by D-91's top-up (`getMoreReelCards`), which is
 * the whole reason it is a function: a second, batch-only copy of this would
 * be a second place the photo gate could be got wrong, and card sixteen must
 * be built by exactly the rules that built card one.
 *
 * `only` narrows what is *returned* and what is *queried* — but never what is
 * considered for a mission. Missions are capped at two a day across every
 * surface (`selectMissionEligible`), so the cap is applied to the whole
 * rank-ordered deck and a top-up batch inherits whatever is left of it, which
 * is normally nothing.
 */
/**
 * The minimum a card needs to be built (D-91b).
 *
 * Structural rather than `ReelCandidate`, because Meri List builds cards for
 * people who have no `DailyReelProfile` row at all — somebody reached from
 * search, or swiped on a day whose reel has long since been superseded. Those
 * arrive as a profile with nulls where the persisted scores would be, and the
 * card comes out identical, because every number on it is re-derived from the
 * live profiles anyway (see `toCard`).
 */
export type CardSource = {
  profile: ReelCandidate["profile"];
  aiReasonText: string | null;
  aiConcernText: string | null;
  aiFactsHash: string | null;
  spotlightDelivery: { id: string } | null;
  finalScore: number;
  preferenceScore: number | null;
  deepProfileFit: number | null;
  /**
   * The stored trust/activity numbers, used only as a fallback when the live
   * re-score could not run (no viewer profile). A history card has no stored
   * pair, so it passes the profile's own current trust and a neutral activity
   * — both of which the live re-score replaces on the very next line.
   */
  trustScoreFactor: number;
  recentActivityScore: number;
};

export async function buildCards(
  userId: string,
  viewer: ViewerLite,
  rankedCandidates: CardSource[],
  t: Translate,
  only?: Set<string>,
  /**
   * Missions are a *daily* scarcity (at most two, across every surface). A
   * history lane is not today's reel, so it never spends one — otherwise
   * scrolling old profiles would hand out the day's prompts to cards the
   * ranking never chose.
   */
  allowMissions = true,
): Promise<ReelCardViewModel[]> {
  // Candidates arrive rank-ordered, so "the first two that clear the floor" is
  // also "the two best" — no second sort, and stable across refreshes because
  // it is derived from the persisted reel rather than from session state.
  // Selection itself lives in missionService.ts (Phase G9), so Grio's deck
  // reads the identical decision instead of a second copy of it. The floor
  // is re-checked against a *live* re-score below (`toCard`), so a row whose
  // stored score has since lost its evidence never earns a mission headline.
  const missionIds = allowMissions
    ? new Set(selectMissionEligible(rankedCandidates).map((c) => c.profile.id))
    : new Set<string>();

  const candidates = only ? rankedCandidates.filter((c) => only.has(c.profile.id)) : rankedCandidates;
  if (candidates.length === 0) return [];

  const candidateUserIds = candidates.map((c) => c.profile.userId);
  const candidateProfileIds = candidates.map((c) => c.profile.id);
  const [matches, vibeBadges, askedStatuses, blessings, canUnlockAll, signals, likeStates, swipes, shortlistRows, interestRows] = await Promise.all([
    prisma.match.findMany({
      where: {
        OR: [
          { userAId: userId, userBId: { in: candidateUserIds } },
          { userBId: userId, userAId: { in: candidateUserIds } },
        ],
      },
    }),
    getVibeBadgesForUsers(candidateUserIds),
    getAskedStatusMap(userId, candidateUserIds),
    // One indexed read for the whole screen — see the function's own note on
    // why the reel can't call the single-owner reader per card.
    getPublicParentBlessings(candidateUserIds),
    canViewerUnlockPhotos(userId),
    // Three indexed reads (dimension scores, poll votes, signal answers) for
    // the whole batch at once — the same loader the pipeline uses at generation
    // time, so "Why this match?" compares exactly what the ranking compared.
    viewer
      ? loadMatchSignals([viewer, ...candidates.map((c) => c.profile)])
      : Promise.resolve<MatchSignals>({}),
    getLikeStates(userId, candidates.map((c) => c.profile.id)),
    // D-92: has this member met these people before, and did they decide
    // anything? Asked here, once per batch, so every surface that builds a
    // card — today's deck, a top-up, the seen half of the feed, a Meri List
    // lane — answers it the same way instead of each one inventing a rule.
    prisma.swipeAction.findMany({
      where: { actorUserId: userId, targetProfileId: { in: candidateProfileIds } },
      orderBy: { createdAt: "desc" },
      select: { targetProfileId: true, direction: true },
    }),
    // The rail's two toggles start from the rows themselves, not from the
    // swipe history — a save or an interest made from the profile page, or an
    // un-save, leaves no swipe behind, and a toggle that opens in the wrong
    // state is the first thing a member notices.
    prisma.shortlist.findMany({
      where: { userId, targetProfileId: { in: candidateProfileIds } },
      select: { targetProfileId: true },
    }),
    prisma.interest.findMany({
      where: { fromUserId: userId, toUserId: { in: candidateUserIds }, status: { not: "WITHDRAWN" } },
      select: { toUserId: true },
    }),
  ]);
  const shortlistedIds = new Set(shortlistRows.map((r) => r.targetProfileId));
  const interestSentTo = new Set(interestRows.map((r) => r.toUserId));
  // Newest row first, so the first non-UP direction seen for a profile is the
  // *latest* decision. UP is a look, never a decision: it leaves the key in
  // place (they were seen) with a null value.
  const history = new Map<string, Exclude<ReelSwipeDirection, "UP"> | null>();
  for (const row of swipes) {
    const decision = row.direction === "UP" ? null : (row.direction as Exclude<ReelSwipeDirection, "UP">);
    if (!history.has(row.targetProfileId)) history.set(row.targetProfileId, decision);
    else if (history.get(row.targetProfileId) === null && decision) history.set(row.targetProfileId, decision);
  }
  const matchedUserIds = new Set(matches.flatMap((m) => [m.userAId, m.userBId]).filter((id) => id !== userId));
  // The same rows, keyed the way a card needs them: "who is this, and where is
  // our chat". One query serving both the gate and the button is the point —
  // a card that unlocks a photo because of a match must also be able to open
  // that match's chat, and two queries would eventually disagree.
  const matchIds = new Map(matches.map((m) => [m.userAId === userId ? m.userBId : m.userAId, m.id]));
  // The gate and its reason for every card at once — the card needs the reason
  // to say the true sentence and offer only a way in that would actually work.
  const photoLocks = new Map<string, PhotoLock>(
    candidates.map((c) => [
      c.profile.id,
      photoLockFor({
        matched: matchedUserIds.has(c.profile.userId),
        viewerCanUnlockAll: canUnlockAll,
        ownerPhotoPrivacy: c.profile.photoPrivacy,
      }),
    ]),
  );

  return candidates.map((c) => ({
    ...toCard(
      c,
      photoLocks,
      viewer,
      missionIds.has(c.profile.id),
      vibeBadges,
      askedStatuses,
      blessings,
      signals,
      history,
      matchIds,
      t,
    ),
    liked: likeStates.has(c.profile.id),
    shortlisted: shortlistedIds.has(c.profile.id),
    interestSent: interestSentTo.has(c.profile.userId),
  }));
}

/**
 * How the two halves of "For You" sit together: two new rishtey, then one the
 * member has seen before (D-92).
 *
 * Fresh-led, because the ranking put the best unmet rishtey at the top and
 * they are what the screen is for — but often enough that the feed reads as
 * one mixed pile rather than "the new ones, and then the old ones at the
 * bottom", which is the version nobody scrolls to. When either stream runs
 * out the rest of the other simply follows.
 */
const SEEN_EVERY = 3;

/**
 * How many of a member's own unanswered fields the end of the feed offers.
 *
 * Eight, because that is a deck somebody finishes. The full list can be thirty
 * or more, and "ab ye tees cheezein bhar dijiye" at the end of a browsing
 * session is a chore, not an offer — the next visit brings the next eight.
 */
export const REEL_END_GAP_CARDS = 8;

export function mixSeenIntoFresh<T>(fresh: T[], seen: T[]): T[] {
  const out: T[] = [];
  let f = 0;
  let s = 0;
  while (f < fresh.length || s < seen.length) {
    const seenSlot = (out.length + 1) % SEEN_EVERY === 0;
    if (s < seen.length && (seenSlot || f >= fresh.length)) out.push(seen[s++]);
    else out.push(fresh[f++]);
  }
  return out;
}

/**
 * Today's deck as the reel screen first receives it.
 *
 * Since D-91 this is the *first batch*, not the whole day: the screen asks for
 * more through `getMoreReelCards` as the member works down the stack, and the
 * pool — not a number — decides when it ends.
 *
 * ## Two streams, one deck (D-92)
 *
 * What comes back is the new rishtey *and* the ones this member has already
 * seen, mixed by `mixSeenIntoFresh`. "For You" is the whole feed now, which is
 * what lets it be scrolled up and down like one: the "New" pills is a filter
 * over the same cards (`seenBefore`), never a separate fetch.
 */
export async function getReelData(userId: string, t: Translate = noopT): Promise<ReelViewModel> {
  const [reel, viewer, blockedUserIds] = await Promise.all([
    getOrCreateTodayReel(userId),
    prisma.profile.findUnique({ where: { userId }, include: PROFILE_FULL_INCLUDE }),
    getBlockedUserIds(userId),
  ]);

  // `getCandidates` already excludes blocked people at *generation* time, but a
  // reel is generated once a day and persisted. Someone blocked at 4pm would
  // otherwise keep appearing in a reel built at 9am — which is exactly the
  // moment a block has to work. Filtering again on read costs one array pass.
  const blocked = new Set(blockedUserIds);
  // Every row this member has written against today's dealt cards, newest
  // first. Two different questions are answered from it:
  //
  // 1. Which of today's cards have already been on screen (D-92). Those are
  //    not "fresh" any more, and they are dealt back by `getSeenDeckPage`
  //    instead — in the seen half of the feed, with what happened to them on
  //    the card. Without this a reload put the whole day back at position one:
  //    scroll eighty, refresh, start again at one.
  // 2. Today's recap numbers, which count *decisions* and so ignore the UP
  //    rows — a look is not a decision.
  //
  // It also bounds the page: `buildCards` re-scores every card it is given, so
  // sending back the whole day's history would make the reel slower the more
  // of it somebody used.
  const swipesToday = await prisma.swipeAction.findMany({
    where: {
      actorUserId: userId,
      targetProfileId: { in: reel.candidates.map((c) => c.profileId) },
    },
    orderBy: { createdAt: "desc" },
    select: { targetProfileId: true, direction: true },
  });
  const seen = new Set(swipesToday.map((s) => s.targetProfileId));
  // One row per person for the recap — the newest, since the rows arrive
  // newest-first. A card that was decided, looked at again and decided the
  // same way is one decision, not three.
  const latestDecision = new Map<string, (typeof swipesToday)[number]>();
  for (const row of swipesToday) {
    if (row.direction === "UP") continue;
    if (!latestDecision.has(row.targetProfileId)) latestDecision.set(row.targetProfileId, row);
  }
  const decisions = [...latestDecision.values()];
  const candidates = reel.candidates.filter(
    (c) => !blocked.has(c.profile.userId) && !seen.has(c.profileId),
  );

  const [freshCards, seenPage] = await Promise.all([
    buildCards(userId, viewer, candidates, t),
    // The other half of the feed. It is asked for even when the fresh pool is
    // full: "sab mix hone chahiye" is the whole ask, so the first screenful
    // already carries both kinds.
    getSeenDeckPage(userId, viewer, null, undefined, t),
  ]);
  const cards = mixSeenIntoFresh(freshCards, seenPage.cards);

  const [laneCounts, everDecided, canUnlockAll, viewerSignals, voiceGate, askBridgeGate, quests, canEnhance, canUltraEnhance, unreadMessages] =
    await Promise.all([
      getLaneCounts(userId),
      // Has this member ever decided on anybody, on any day? It is what tells
      // "nobody has matched you yet" apart from "you have worked through
      // everyone" on a day whose reel came back empty — today's reel row alone
      // cannot say, because both of them produce zero candidates.
      prisma.swipeAction.findFirst({
        where: { actorUserId: userId, direction: { not: "UP" } },
        select: { id: true },
      }),
      canViewerUnlockPhotos(userId),
      // The viewer's own answers only — `preferenceNoticeFor` asks what *they*
      // have stated, never anything about a candidate.
      viewer ? loadMatchSignals([viewer]) : Promise.resolve<MatchSignals>({}),
      isFeatureAvailable(userId, "voiceNotes"),
      isFeatureAvailable(userId, "askBridge"),
      getActiveQuests(userId),
      canUsePhotoEnhance(userId),
      canUsePhotoUltraEnhance(userId),
      // "Kisi ne jawab diya hai" — the one piece of news that has nowhere else
      // to land on a full-bleed screen with no header and no bottom nav. Rows
      // the sender wrote and this member has not opened, across every chat.
      prisma.message.count({
        where: {
          senderId: { not: userId },
          readAt: null,
          match: { OR: [{ userAId: userId }, { userBId: userId }] },
        },
      }),
    ]);

  const dailyVoiceQuest = quests.find((q) => q.key === "daily_voice_note" && !q.completed);

  const viewerPhoto = viewer?.photos.find((ph) => ph.isPrimary) ?? viewer?.photos[0];
  // "Waiting on us" vs "nothing uploaded" — two different sentences for the
  // gate, and `canUnlockAll` alone cannot tell them apart (it is false for
  // both). Deleted rows are excluded the same way `canViewerUnlockPhotos`
  // excludes them, so the two never disagree about what exists.
  const viewerLivePhotos = (viewer?.photos ?? []).filter((ph) => !ph.deletedAt);

  return {
    reelId: reel.id,
    reelDate: reel.reelDate.toISOString().slice(0, 10),
    cards,
    seenCursor: seenPage.nextCursor,
    viewer: {
      name: viewer?.displayName ?? t("matchReel.card.fallbackName", "Profile"),
      // Their own face, shown only back to them — no gate applies to a person
      // looking at themselves, which is why this reads the row directly rather
      // than going through `photoLockFor`.
      photoUrl: viewerPhoto?.fileUrl ?? null,
      needsOwnPhoto: !canUnlockAll,
      photoInReview:
        !canUnlockAll && viewerLivePhotos.some((ph) => ph.verificationStatus === "PENDING"),
      canPhotoEnhance: canEnhance,
      canPhotoUltraEnhance: canUltraEnhance,
      city: viewer?.currentCity ?? null,
    },
    laneCounts,
    refineQuestions: refineQuestionsFor(viewer),
    preferenceNotice: preferenceNoticeFor(viewer, viewerSignals, t),
    todayDecisions: {
      // "Kitni profiles dekhi" — every person who was on screen today, which
      // since D-92 includes the ones simply scrolled past (their UP rows).
      // The recap says "dekhi", and a card you looked at and moved on from was
      // looked at.
      seen: seen.size,
      sent: decisions.filter((d) => d.direction === "RIGHT").length,
      shortlisted: decisions.filter((d) => d.direction === "DOWN").length,
    },
    // Not `cards`, and not today's deck alone: a member who has worked through
    // every rishta — today or last week — is not an empty pool, and must not be
    // met with "profile complete karein aur thodi der baad wapas aayein". They
    // get the closing card, which says the true thing.
    emptyState:
      reel.candidates.length === 0 && !everDecided
        ? {
            title: t("matchReel.reel.empty.title", "Abhi suitable rishtey available nahi hain."),
            description: t(
              "matchReel.reel.empty.description",
              "Profile complete karein aur thodi der baad wapas aayein.",
            ),
          }
        : null,
    unreadMessages,
    // What is still missing from their *own* profile, for the deck the closing
    // card opens. Computed from the same values-mapping every other completion
    // number uses, so this list and "profile kitni poori hai" can never
    // disagree about what counts as answered.
    profileGaps: viewer
      ? computeCompletion(viewer).missingFullFields.slice(0, REEL_END_GAP_CARDS).map((f) => f.key)
      : [],
    voiceEnabled: voiceGate.allowed,
    askBridgeEnabled: askBridgeGate.allowed,
    voiceQuest: dailyVoiceQuest
      ? { title: dailyVoiceQuest.title, rewardLabel: dailyVoiceQuest.rewardLabel }
      : null,
  };
}

/**
 * The next batch of cards, built exactly as the first one was — D-91, and
 * since D-92 from the same two streams as the first one.
 *
 * `exhausted` comes from both of them actually being empty, not from a short
 * batch: a batch can come back short because half of it was blocked since this
 * morning, and telling somebody "ab koi rishta nahi hai" when there is one
 * would be the worst possible version of this screen's one promise. It now
 * also means "and nobody you have seen before is left either", which is the
 * only honest end of a feed that deliberately comes back round.
 *
 * `seenCursor` is where the previous batch left the seen half. The screen hands
 * back whatever it was last given; a stale or nonsense value costs a repeated
 * page, which the screen drops by id anyway.
 */
export async function getMoreReelCards(
  userId: string,
  t: Translate = noopT,
  seenCursor: string | null = null,
): Promise<{ cards: ReelCardViewModel[]; exhausted: boolean; seenCursor: string | null }> {
  const [{ reel, addedProfileIds }, viewer, blockedUserIds] = await Promise.all([
    extendTodayReel(userId),
    prisma.profile.findUnique({ where: { userId }, include: PROFILE_FULL_INCLUDE }),
    getBlockedUserIds(userId),
  ]);

  const seenPage = await getSeenDeckPage(userId, viewer, seenCursor, undefined, t);
  if (addedProfileIds.length === 0 && seenPage.cards.length === 0) {
    return { cards: [], exhausted: true, seenCursor: null };
  }

  const blocked = new Set(blockedUserIds);
  const candidates = reel.candidates.filter((c) => !blocked.has(c.profile.userId));
  const freshCards = addedProfileIds.length
    ? await buildCards(userId, viewer, candidates, t, new Set(addedProfileIds))
    : [];
  return {
    cards: mixSeenIntoFresh(freshCards, seenPage.cards),
    exhausted: false,
    seenCursor: seenPage.nextCursor,
  };
}
