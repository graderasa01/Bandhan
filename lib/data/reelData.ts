import { prisma } from "@/lib/db/prisma";
import { getOrCreateTodayReel } from "@/lib/services/match/reelGenerator";
import { ageFromDate } from "@/lib/services/match/age";
import { isFeatureAvailable, reelUpgradeHint } from "@/lib/services/plans/entitlements";
import { getActiveQuests } from "@/lib/services/quests/questService";
import { getKundliNotes } from "@/lib/services/kundli/kundliService";
import { getBlockedUserIds } from "@/lib/services/safety/blockService";
import { buildPhotoSlides } from "@/lib/services/profile/photoSlides";
import { getVibeBadgesForUsers, type VibeBadgeView } from "@/lib/services/vibe/pollService";
import { getAskedStatusMap } from "@/lib/services/askBridge/profileQuestionService";
import type { ReelCardViewModel, ReelViewModel } from "@/lib/contracts/reel";
import type { ProfileQuestionStatus } from "@prisma/client";

type ReelWithCandidates = Awaited<ReturnType<typeof getOrCreateTodayReel>>;
type ReelCandidate = ReelWithCandidates["candidates"][number];

type ViewerLite = {
  currentCity: string | null;
  lifestyle: { diet: string | null; hobbies: string[] } | null;
  // Only these two of the viewer's traditional fields are read. birthTime and
  // birthPlace are never selected here — the profile builder tells the user
  // they are "sirf kundli ke liye — kisi aur ko kabhi nahi dikhta".
  basicDetails: { gotra: string | null; manglikStatus: string | null } | null;
} | null;

/**
 * Deterministic viewer↔candidate field overlap, shown as floating chips on
 * the card. Deliberately not AI-generated (D-32: AI explains, code decides
 * facts) — this is the same visibility-safe field set already used by
 * `explain.ts`/`reel/ask`, just diffed against the viewer instead of prosed.
 */
function computeSharedTags(viewer: ViewerLite, candidate: ReelCandidate["profile"]): string[] {
  if (!viewer) return [];
  const tags: string[] = [];

  if (viewer.currentCity && candidate.currentCity && viewer.currentCity === candidate.currentCity) {
    tags.push(`Same city: ${candidate.currentCity}`);
  }

  const viewerDiet = viewer.lifestyle?.diet;
  const candidateDiet = candidate.lifestyle?.diet;
  if (viewerDiet && candidateDiet && viewerDiet === candidateDiet) {
    tags.push(`Dono ${candidateDiet}`);
  }

  const viewerHobbies = viewer.lifestyle?.hobbies ?? [];
  const candidateHobbies = candidate.lifestyle?.hobbies ?? [];
  const commonHobby = viewerHobbies.find((h) => candidateHobbies.includes(h));
  if (commonHobby) tags.push(`Common hobby: ${commonHobby}`);

  return tags.slice(0, 3);
}

/**
 * A card must score at least this to be allowed a voice-note prompt.
 *
 * Set from the product rule in the architecture doc §7.1, not tuned to hit a
 * target number of prompts — if a day's reel has nothing above the floor, the
 * right outcome is no prompts that day.
 */
const MISSION_SCORE_FLOOR = 85;
/** Per day, per user. Two prompts read as "AI noticed something"; five read as a nag. */
const MISSION_MAX_PER_DAY = 2;

/**
 * What to say, built from the overlap the card already shows.
 *
 * Deterministic on purpose (D-32). The hard part of recording ten seconds for
 * a stranger is the first sentence, and a template that names a real shared
 * detail solves it — while an AI-written opener would be one more thing that
 * could invent a fact neither profile stated.
 */
function buildMissionSuggestion(sharedTags: string[], strengths: string[]): string {
  const hobby = sharedTags.find((t) => t.startsWith("Common hobby: "));
  if (hobby) {
    return `Bataiye ki aapko bhi ${hobby.replace("Common hobby: ", "")} pasand hai.`;
  }
  const city = sharedTags.find((t) => t.startsWith("Same city: "));
  if (city) {
    return `Bataiye ki aap dono ek hi sheher me hain — ${city.replace("Same city: ", "")}.`;
  }
  const diet = sharedTags.find((t) => t.startsWith("Dono "));
  if (diet) return `Bataiye ki aap dono ki diet ek jaisi hai.`;
  if (strengths[0]) return `Bataiye ki inki ye baat achhi lagi — ${strengths[0].toLowerCase()}.`;
  return "Bataiye ki inki profile me kya baat achhi lagi.";
}

function toCard(
  candidate: ReelCandidate,
  unlockedProfileIds: Set<string>,
  viewer: ViewerLite,
  missionAllowed: boolean,
  vibeBadges: Map<string, VibeBadgeView>,
  askedStatuses: Map<string, ProfileQuestionStatus>,
): ReelCardViewModel {
  const p = candidate.profile;
  const primaryPhoto = p.photos.find((ph) => ph.isPrimary) ?? p.photos[0];
  const unlocked = unlockedProfileIds.has(p.id);
  const compatibility = Math.round(candidate.finalScore);
  const sharedTags = computeSharedTags(viewer, p);
  const strengths = candidate.aiReasonText ? candidate.aiReasonText.split(" • ") : [];

  return {
    id: p.id,
    displayName: p.displayName ?? "Profile",
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
    photoFocalY: unlocked ? (primaryPhoto?.focalY ?? null) : null,
    // Same withheld-not-hidden rule as photoUrl: a locked card gets an empty
    // array, not slide URLs covered by a lock icon over static uploads.
    slides: unlocked ? buildPhotoSlides(p.photos) : [],
    bioNote: unlocked ? p.bioText?.trim() || null : null,
    compatibility,
    segments: [
      { key: "preference", label: "Preferences", value: Math.round(candidate.preferenceScore), color: "#C9A96E" },
      // Absent, not zero, when this pair shares no thinking data at all. Named
      // "Soch Fit" rather than "Deep Fit" since sochFit.ts widened it: it now
      // blends poll answers and the mindset trio with the AI dimensions, so
      // "Deep Fit" would credit the analysis for a number the user's own poll
      // answers largely produced.
      ...(candidate.deepProfileFit !== null
        ? [{ key: "deepFit", label: "Soch Fit", value: Math.round(candidate.deepProfileFit), color: "#2456C9" }]
        : []),
      { key: "trust", label: "Trust", value: Math.round(candidate.trustScoreFactor), color: "#1F7A5A" },
      { key: "activity", label: "Activity", value: Math.round(candidate.recentActivityScore), color: "#7A1F2B" },
    ],
    strengths,
    concern: candidate.aiConcernText,
    sharedTags,
    // Display-only. Never fed back into scoring — see kundliService's header.
    kundliNotes: viewer
      ? getKundliNotes(
          { gotra: viewer.basicDetails?.gotra, manglikStatus: viewer.basicDetails?.manglikStatus },
          { gotra: p.basicDetails?.gotra, manglikStatus: p.basicDetails?.manglikStatus },
        )
      : [],
    mission:
      missionAllowed && compatibility >= MISSION_SCORE_FLOOR
        ? {
            headline: `${compatibility}% match — aaj ke sabse strong rishton me se ek`,
            suggestion: buildMissionSuggestion(sharedTags, strengths),
          }
        : null,
    vibeBadge: vibeBadges.get(p.userId) ?? null,
    askedStatus: askedStatuses.get(p.userId) ?? "NONE",
  };
}

export async function getReelData(userId: string): Promise<ReelViewModel> {
  const [reel, viewer, blockedUserIds] = await Promise.all([
    getOrCreateTodayReel(userId),
    prisma.profile.findUnique({
      where: { userId },
      select: {
        currentCity: true,
        lifestyle: { select: { diet: true, hobbies: true } },
        basicDetails: { select: { gotra: true, manglikStatus: true } },
      },
    }),
    getBlockedUserIds(userId),
  ]);

  // `getCandidates` already excludes blocked people at *generation* time, but a
  // reel is generated once a day and persisted. Someone blocked at 4pm would
  // otherwise keep appearing in a reel built at 9am — which is exactly the
  // moment a block has to work. Filtering again on read costs one array pass.
  const blocked = new Set(blockedUserIds);
  const candidates = reel.candidates.filter((c) => !blocked.has(c.profile.userId));

  const candidateUserIds = candidates.map((c) => c.profile.userId);
  const [matches, vibeBadges, askedStatuses] = await Promise.all([
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
  ]);
  const matchedUserIds = new Set(matches.flatMap((m) => [m.userAId, m.userBId]).filter((id) => id !== userId));
  const unlockedProfileIds = new Set(
    candidates.filter((c) => matchedUserIds.has(c.profile.userId)).map((c) => c.profile.id),
  );

  // Candidates arrive rank-ordered, so "the first two that clear the floor" is
  // also "the two best" — no second sort, and stable across refreshes because
  // it is derived from the persisted reel rather than from session state.
  let missionsLeft = MISSION_MAX_PER_DAY;
  const cards = candidates.map((c) => {
    const allowed = missionsLeft > 0 && Math.round(c.finalScore) >= MISSION_SCORE_FLOOR;
    if (allowed) missionsLeft--;
    return toCard(c, unlockedProfileIds, viewer, allowed, vibeBadges, askedStatuses);
  });

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
    emptyState:
      cards.length === 0
        ? {
            title: "Abhi suitable rishtey available nahi hain.",
            description: "Profile complete karein aur thodi der baad wapas aayein.",
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
