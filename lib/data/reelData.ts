import { prisma } from "@/lib/db/prisma";
import { getOrCreateTodayReel } from "@/lib/services/match/reelGenerator";
import { ageFromDate } from "@/lib/services/match/age";
import { isFeatureAvailable, reelUpgradeHint } from "@/lib/services/plans/entitlements";
import { canViewerUnlockPhotos, photoLockFor } from "@/lib/services/plans/photoAccess";
import type { PhotoLock } from "@/lib/contracts/photoLock";
import { getActiveQuests } from "@/lib/services/quests/questService";
import { getKundliNotes } from "@/lib/services/kundli/kundliService";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { buildPhotoSlides } from "@/lib/services/profile/photoSlides";
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

/**
 * Deterministic viewer↔candidate field overlap, shown as floating chips on
 * the card. Deliberately not AI-generated (D-32: AI explains, code decides
 * facts) — this is the same visibility-safe field set already used by
 * `explain.ts`/`reel/ask`, just diffed against the viewer instead of prosed.
 */
function computeSharedTags(
  viewer: ViewerLite,
  candidate: ReelCandidate["profile"],
  t: Translate = noopT,
): string[] {
  if (!viewer) return [];
  const tags: string[] = [];

  if (viewer.currentCity && candidate.currentCity && viewer.currentCity === candidate.currentCity) {
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

function preferenceFor(scored: ScoredCandidate | null, t: Translate): ReelCardPreference {
  if (!scored) return { state: "NOT_PROVIDED", score: null, note: null };
  const { state, score } = scored.preference;
  if (state === "COMPARABLE") return { state, score, note: null };
  return {
    state,
    score: null,
    note:
      state === "NOT_PROVIDED"
        ? t("matchReel.card.preferenceNotProvided", "General suggestion — preference match calculate nahi hua.")
        : t("matchReel.card.preferencePartial", "Aapki pasand se tulna ke liye is profile par data kam hai."),
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
  candidate: ReelCandidate,
  photoLocks: Map<string, PhotoLock>,
  viewer: ViewerLite,
  missionAllowed: boolean,
  vibeBadges: Map<string, VibeBadgeView>,
  askedStatuses: Map<string, ProfileQuestionStatus>,
  signals: MatchSignals,
  t: Translate = noopT,
): ReelCardViewModel {
  const p = candidate.profile;
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
  const preference = preferenceFor(scored, t);
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
    askedStatus: askedStatuses.get(p.userId) ?? "NONE",
    whyThisMatch,
    facts: facts.fields
      .filter((f) => SHEET_FACT_GROUPS.has(f.group))
      .map((f) => ({ group: f.group, label: f.label, value: f.value })),
  };
}

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
  const candidates = reel.candidates.filter((c) => !blocked.has(c.profile.userId));

  const candidateUserIds = candidates.map((c) => c.profile.userId);
  const [matches, vibeBadges, askedStatuses, canUnlockAll, signals] = await Promise.all([
    candidateUserIds.length
      ? prisma.match.findMany({
          where: {
            OR: [
              { userAId: userId, userBId: { in: candidateUserIds } },
              { userBId: userId, userAId: { in: candidateUserIds } },
            ],
          },
        })
      : Promise.resolve([]),
    getVibeBadgesForUsers(candidateUserIds),
    getAskedStatusMap(userId, candidateUserIds),
    canViewerUnlockPhotos(userId),
    // Three indexed reads (dimension scores, poll votes, signal answers) for
    // the whole reel at once — the same loader the pipeline uses at generation
    // time, so "Why this match?" compares exactly what the ranking compared.
    viewer && candidates.length
      ? loadMatchSignals([viewer, ...candidates.map((c) => c.profile)])
      : Promise.resolve<MatchSignals>({}),
  ]);
  const matchedUserIds = new Set(matches.flatMap((m) => [m.userAId, m.userBId]).filter((id) => id !== userId));
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

  // Candidates arrive rank-ordered, so "the first two that clear the floor" is
  // also "the two best" — no second sort, and stable across refreshes because
  // it is derived from the persisted reel rather than from session state.
  // Selection itself lives in missionService.ts (Phase G9), so Grio's deck
  // reads the identical decision instead of a second copy of it. The floor
  // is re-checked against a *live* re-score below (`toCard`), so a row whose
  // stored score has since lost its evidence never earns a mission headline.
  const missionIds = new Set(selectMissionEligible(candidates).map((c) => c.profile.id));
  const cards = candidates.map((c) =>
    toCard(c, photoLocks, viewer, missionIds.has(c.profile.id), vibeBadges, askedStatuses, signals, t),
  );

  const [upgradeHint, voiceGate, askBridgeGate, quests] = await Promise.all([
    reelUpgradeHint(userId),
    isFeatureAvailable(userId, "voiceNotes"),
    isFeatureAvailable(userId, "askBridge"),
    getActiveQuests(userId),
  ]);

  const dailyVoiceQuest = quests.find((q) => q.key === "daily_voice_note" && !q.completed);

  return {
    reelId: reel.id,
    reelDate: reel.reelDate.toISOString().slice(0, 10),
    dailyLimit: reel.dailyLimit,
    cards,
    preferenceNotice: preferenceNoticeFor(viewer, signals, t),
    emptyState:
      cards.length === 0
        ? {
            title: t("matchReel.reel.empty.title", "Abhi suitable rishtey available nahi hain."),
            description: t(
              "matchReel.reel.empty.description",
              "Profile complete karein aur thodi der baad wapas aayein.",
            ),
          }
        : null,
    upgradeHint,
    voiceEnabled: voiceGate.allowed,
    askBridgeEnabled: askBridgeGate.allowed,
    voiceQuest: dailyVoiceQuest
      ? { title: dailyVoiceQuest.title, rewardLabel: dailyVoiceQuest.rewardLabel }
      : null,
  };
}
