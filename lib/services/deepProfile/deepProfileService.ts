import "server-only";
import { prisma } from "@/lib/db/prisma";
import { callAi } from "@/lib/ai/providers";
import { getEntitlements, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { getProfileVisibility } from "@/lib/services/profile/visibility";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import {
  CONFIDENCE_UNKNOWN_THRESHOLD,
  DIMENSION_LABELS,
  getEntitledDimensionKeys,
} from "@/lib/constants/deepDimensions";
import { pickGapQuestion, type GapQuestionDef } from "@/lib/profile/dailyQuestions";
import type { DeepDimensionKey } from "@prisma/client";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * D-11's `deepDimensions` — computing and caching 05_ai_spec.md §15's 13
 * dimension scores.
 *
 * ## Why this reads the profile, not a dedicated question flow
 *
 * §15's contract assumes M06's own deep-question interview, which is a
 * separate module nobody has built. Waiting for it would mean this ladder
 * item stays a promise forever. Instead, this derives scores from what the
 * profile already has — bio, lifestyle, family, the three tap-only mindset
 * answers, profession — the same "understand what's really there, don't
 * invent" discipline `bioWriter` and `matchExplanation` already follow. When
 * M06 ships real question-and-answer data, it becomes a second, richer input
 * this same function can fold in — the cache shape doesn't have to change.
 *
 * `loadVoiceSignals` below is exactly that "richer input" arriving early —
 * the owner's own Parent Blessing and Ask Bridge answer transcripts (already
 * approved, on-device Web Speech text riding on the clip). Deliberately
 * **self-view only**: `getDeepProfileView`/`computeAndStoreScores` are always
 * called with the profile owner's own `userId`, never a viewer's — so folding
 * a Question-Answer clip's transcript in here never surfaces it to anyone
 * beyond who could already hear that clip, and the score/explanation this
 * produces is never shown to strangers browsing the profile, only to the
 * owner themselves (plus L2's internal matching math). That boundary is why
 * this is safe in a way a stranger-facing "ask AI about this profile's
 * secrets" feature would not be — see AI Concierge's docstring for the
 * opposite, deliberately-refused design.
 *
 * ## Why this is cached, not computed per read
 *
 * Every computation is one AI call. Reading a profile is not. `computedAt` on
 * each row plus `Profile.updatedAt` is the staleness check — see
 * `needsRecompute`. Nothing here is triggered from L2 match scoring itself
 * (D-33: L2 stays pure TS, no AI) — see pipeline.ts for how already-cached
 * scores get consumed there.
 */

/**
 * 13 dimensions × (score + label + confidence + a Hinglish explanation
 * sentence) genuinely needs room — 2000 truncated the JSON mid-response on
 * the very first live test (13 keys, real profile data). Matches
 * `AI_LIMITS.extractionMaxTokens`, this codebase's other "many structured
 * fields in one response" ceiling.
 */
const MAX_TOKENS = 4096;

interface DimensionInput {
  bioText: string | null;
  diet: string | null;
  smoking: string | null;
  drinking: string | null;
  hobbies: string[];
  relocateWilling: string | null;
  weekendVibe: string | null;
  bigDecisionStyle: string | null;
  socialEnergy: string | null;
  familyType: string | null;
  familyValues: string | null;
  familyBackgroundSummary: string | null;
  professionCategory: string | null;
  /** Latest approved Parent Voice Blessing transcript — already public on this
   * owner's own profile, so folding it in here adds no new exposure. */
  parentBlessingText: string | null;
  /** The owner's own answers to Ask Bridge questions others asked them —
   * about themselves, in their own words. Only ever read back to this same
   * owner (see module docstring), never shown to the askers who received
   * the original clips. */
  selfAnsweredQaText: string | null;
}

interface ExtraSignals {
  parentBlessingText: string | null;
  selfAnsweredQaText: string | null;
}

function buildInput(profile: ProfileWithSubTables, extra: ExtraSignals): DimensionInput {
  return {
    bioText: profile.bioText,
    diet: profile.lifestyle?.diet ?? null,
    smoking: profile.lifestyle?.smoking ?? null,
    drinking: profile.lifestyle?.drinking ?? null,
    hobbies: profile.lifestyle?.hobbies ?? [],
    relocateWilling: profile.lifestyle?.relocateWilling ?? null,
    weekendVibe: profile.lifestyle?.weekendVibe ?? null,
    bigDecisionStyle: profile.lifestyle?.bigDecisionStyle ?? null,
    socialEnergy: profile.lifestyle?.socialEnergy ?? null,
    familyType: profile.family?.familyType ?? null,
    familyValues: profile.family?.familyValues ?? null,
    familyBackgroundSummary: profile.family?.familyBackgroundSummary ?? null,
    professionCategory: profile.profession?.professionCategory ?? null,
    parentBlessingText: extra.parentBlessingText,
    selfAnsweredQaText: extra.selfAnsweredQaText,
  };
}

/** How many real (non-null) signals the input actually has — a cheap proxy for "is there enough to say anything". */
function signalCount(input: DimensionInput): number {
  const fields = [
    input.bioText,
    input.diet,
    input.smoking,
    input.drinking,
    input.relocateWilling,
    input.weekendVibe,
    input.bigDecisionStyle,
    input.socialEnergy,
    input.familyType,
    input.familyValues,
    input.familyBackgroundSummary,
    input.professionCategory,
    input.parentBlessingText,
    input.selfAnsweredQaText,
  ];
  return fields.filter((f) => f && f.trim().length > 0).length + (input.hobbies.length > 0 ? 1 : 0);
}

/** VoiceNote transcripts are on-device Web Speech text (MediaAsset.transcript)
 * — free-form, so capped and joined the same way bioText already is treated
 * as one blob of prose, not structured fields. */
const MAX_QA_TRANSCRIPT_CHARS = 1200;

async function loadVoiceSignals(userId: string): Promise<ExtraSignals> {
  const [blessing, answers] = await Promise.all([
    prisma.voiceNote.findFirst({
      where: { fromUserId: userId, toUserId: null, context: "PARENT_BLESSING" },
      orderBy: { createdAt: "desc" },
      select: { mediaAsset: { select: { transcript: true, moderation: true, deletedAt: true } } },
    }),
    prisma.voiceNote.findMany({
      where: { fromUserId: userId, context: "QUESTION_ANSWER" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { mediaAsset: { select: { transcript: true, moderation: true, deletedAt: true } } },
    }),
  ]);

  const parentBlessingText =
    blessing && !blessing.mediaAsset.deletedAt && blessing.mediaAsset.moderation === "APPROVED"
      ? blessing.mediaAsset.transcript?.trim() || null
      : null;

  const qaTexts = answers
    .filter((a) => !a.mediaAsset.deletedAt && a.mediaAsset.moderation === "APPROVED")
    .map((a) => a.mediaAsset.transcript?.trim())
    .filter((t): t is string => Boolean(t));
  const selfAnsweredQaText = qaTexts.length > 0 ? qaTexts.join(" | ").slice(0, MAX_QA_TRANSCRIPT_CHARS) : null;

  return { parentBlessingText, selfAnsweredQaText };
}

const SYSTEM_PROMPT = `Aap BandhanTak ke liye ek profile ka "Deep Profile" analyse kar rahe hain — 05_ai_spec.md ke 13 dimensions me se jitne diye jayein, unke liye score nikaliye.

Rules (mandatory):
- Sirf diye gaye fields se kaam chalaiye. Kabhi kuch mat maaniye jo bataya nahi gaya.
- Har dimension ke liye: score_value (0-100) ya null, score_label (LOW/MODERATE/GOOD/STRONG/UNKNOWN), confidence_score (0-1), explanation_text (1 chhota Hinglish sentence).
- explanation_text me kabhi bhi internal field/variable names mat likhiye (jaise "relocateWilling", "bigDecisionStyle", "professionCategory", "parentBlessingText", "selfAnsweredQaText") — user ko ye code ke naam nahi dikhne chahiye. Uski jagah normal bhasha use kijiye: "relocate ke baare me kuch bataya nahi gaya hai", "bade faislon ke baare me jaankari nahi hai".
- parentBlessingText aur selfAnsweredQaText free-form bola gaya text hai (ek family member ki blessing, aur khud user ke apne jawab). Inhe bhi sirf ek signal ki tarah treat kijiye — kabhi shabd-ba-shabd quote mat kijiye, na hi inse koi aisi baat maaniye jo directly na kahi gayi ho.
- Agar us dimension ke liye bilkul signal nahi hai, to score_value null, score_label "UNKNOWN", confidence_score 0.2 se kam, explanation_text: "Is dimension ka score banane ke liye abhi enough confirmed answers nahi hain."
- confidence_score sirf tabhi 0.6 se upar dijiye jab kam se kam 2 alag signal us dimension ko support karte hon.
- Kabhi flattering ya generic mat likhiye ("mehnati", "zimmedaar") jab tak diya gaya data khud wo shabd na kahe.`;

function buildSchema(keys: DeepDimensionKey[]) {
  return {
    type: "object",
    properties: {
      scores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            dimension_key: { type: "string", enum: keys },
            score_value: { type: ["integer", "null"] },
            score_label: { type: "string", enum: ["LOW", "MODERATE", "GOOD", "STRONG", "UNKNOWN"] },
            confidence_score: { type: "number" },
            explanation_text: { type: "string" },
          },
          required: ["dimension_key", "score_value", "score_label", "confidence_score", "explanation_text"],
          additionalProperties: false,
        },
      },
    },
    required: ["scores"],
    additionalProperties: false,
  } as const;
}

interface RawScore {
  dimension_key: string;
  score_value: number | null;
  score_label: string;
  confidence_score: number;
  explanation_text: string;
}

/** §15.3, enforced in code rather than trusted from the model — D-32. */
function enforceUnknownRule(raw: RawScore): { scoreValue: number | null; scoreLabel: string } {
  if (raw.confidence_score < CONFIDENCE_UNKNOWN_THRESHOLD) {
    return { scoreValue: null, scoreLabel: "UNKNOWN" };
  }
  const clamped = raw.score_value === null ? null : Math.max(0, Math.min(100, Math.round(raw.score_value)));
  return { scoreValue: clamped, scoreLabel: raw.score_label };
}

export type AnalyzeResult =
  | { ok: true; computed: number }
  | { ok: false; message: string };

/** The one place scores are written. Always computes exactly the caller's entitled set. */
export async function computeAndStoreScores(userId: string): Promise<AnalyzeResult> {
  const profile = await prisma.profile.findUnique({ where: { userId }, include: PROFILE_FULL_INCLUDE });
  if (!profile) return { ok: false, message: "Profile nahi mila." };

  const entitlements = await getEntitlements(userId);
  const keys = getEntitledDimensionKeys(entitlements.deepDimensions);
  if (keys.length === 0) return { ok: false, message: "Koi dimension available nahi hai." };

  const extraSignals = await loadVoiceSignals(userId);
  const input = buildInput(profile as unknown as ProfileWithSubTables, extraSignals);
  const hasAnySignal = signalCount(input) > 0;

  // Nothing to analyse — every dimension goes UNKNOWN without spending a call.
  // This is the honest path, not a shortcut: an AI call over an empty profile
  // would just be paying to be told what we already know.
  if (!hasAnySignal) {
    await Promise.all(
      keys.map((dimensionKey) =>
        prisma.profileDimensionScore.upsert({
          where: { profileId_dimensionKey: { profileId: profile.id, dimensionKey } },
          create: {
            profileId: profile.id,
            dimensionKey,
            scoreValue: null,
            scoreLabel: "UNKNOWN",
            confidenceScore: 0,
            explanationText: "Is dimension ka score banane ke liye abhi enough confirmed answers nahi hain.",
          },
          update: {
            scoreValue: null,
            scoreLabel: "UNKNOWN",
            confidenceScore: 0,
            explanationText: "Is dimension ka score banane ke liye abhi enough confirmed answers nahi hain.",
            computedAt: new Date(),
          },
        }),
      ),
    );
    return { ok: true, computed: keys.length };
  }

  const result = await callAi({
    configFeature: "deepProfileAnalysis",
    logFeature: "deep_profile_analysis",
    userId,
    system: SYSTEM_PROMPT,
    content: `Dimensions to score: ${keys.map((k) => `${k} (${DIMENSION_LABELS[k]})`).join(", ")}\n\nProfile data: ${JSON.stringify(input)}`,
    maxTokens: MAX_TOKENS,
    jsonSchema: buildSchema(keys) as unknown as Record<string, unknown>,
    schemaName: "deep_profile_scores",
  });

  if (!result.ok) {
    console.error(`[deepProfile] callAi failed (${result.kind}):`, result.message);
    return { ok: false, message: "Analysis abhi complete nahi ho payi — thodi der me try karein." };
  }

  let parsed: { scores: RawScore[] };
  try {
    parsed = JSON.parse(result.text);
  } catch (err) {
    console.error("[deepProfile] JSON parse failed:", err instanceof Error ? err.message : String(err), result.text.slice(0, 500));
    return { ok: false, message: "AI ka jawab samajh nahi aaya." };
  }

  const byKey = new Map(parsed.scores.map((s) => [s.dimension_key, s]));

  await Promise.all(
    keys.map((dimensionKey) => {
      const raw = byKey.get(dimensionKey);
      if (!raw) {
        // The model skipped a requested key — treat exactly like "no signal",
        // never leave a stale/missing row silently unaddressed.
        return prisma.profileDimensionScore.upsert({
          where: { profileId_dimensionKey: { profileId: profile.id, dimensionKey } },
          create: {
            profileId: profile.id,
            dimensionKey,
            scoreValue: null,
            scoreLabel: "UNKNOWN",
            confidenceScore: 0,
            explanationText: "Is dimension ka score banane ke liye abhi enough confirmed answers nahi hain.",
          },
          update: {
            scoreValue: null,
            scoreLabel: "UNKNOWN",
            confidenceScore: 0,
            computedAt: new Date(),
          },
        });
      }
      const { scoreValue, scoreLabel } = enforceUnknownRule(raw);
      return prisma.profileDimensionScore.upsert({
        where: { profileId_dimensionKey: { profileId: profile.id, dimensionKey } },
        create: {
          profileId: profile.id,
          dimensionKey,
          scoreValue,
          scoreLabel,
          confidenceScore: raw.confidence_score,
          explanationText: raw.explanation_text,
        },
        update: {
          scoreValue,
          scoreLabel,
          confidenceScore: raw.confidence_score,
          explanationText: raw.explanation_text,
          computedAt: new Date(),
        },
      });
    }),
  );

  return { ok: true, computed: keys.length };
}

export interface DimensionScoreView {
  key: DeepDimensionKey;
  label: string;
  scoreValue: number | null;
  scoreLabel: string;
  explanationText: string | null;
  computedAt: string;
}

export interface DeepProfileView {
  /** Entitled AND computed — the score is real and ready to show. */
  unlocked: DimensionScoreView[];
  /** Entitled, but no score exists yet — "Analyze" is the right CTA, not "Upgrade". */
  pendingKeys: DeepDimensionKey[];
  /** Not entitled at all — the padlock state, "Upgrade to see" is the right CTA. */
  lockedKeys: DeepDimensionKey[];
  totalDimensions: number;
  hasAnyComputed: boolean;
}

/**
 * Read-only — never triggers a computation. Callers that want fresh data call
 * `computeAndStoreScores` explicitly.
 *
 * Deliberately three buckets, not two: "entitled but not yet analyzed" and
 * "not entitled at all" look identical from the outside (no score visible)
 * but need opposite calls to action — one is solved by clicking Analyze, the
 * other only by upgrading. Collapsing them would put an "Upgrade" button in
 * front of a Free user who just hasn't run their first analysis yet.
 */
export async function getDeepProfileView(userId: string): Promise<DeepProfileView> {
  const [profile, entitlements] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: { id: true } }),
    getEntitlements(userId),
  ]);
  const entitledKeys = new Set(getEntitledDimensionKeys(entitlements.deepDimensions));
  const allKeys = Object.keys(DIMENSION_LABELS) as DeepDimensionKey[];
  const lockedKeys = allKeys.filter((k) => !entitledKeys.has(k));

  if (!profile) {
    return { unlocked: [], pendingKeys: [...entitledKeys], lockedKeys, totalDimensions: 13, hasAnyComputed: false };
  }

  const rows = await prisma.profileDimensionScore.findMany({ where: { profileId: profile.id } });
  const computedKeys = new Set(rows.map((r) => r.dimensionKey));

  const unlocked = rows
    .filter((r) => entitledKeys.has(r.dimensionKey))
    .map((r) => ({
      key: r.dimensionKey,
      label: DIMENSION_LABELS[r.dimensionKey],
      scoreValue: r.scoreValue,
      scoreLabel: r.scoreLabel,
      explanationText: r.explanationText,
      computedAt: r.computedAt.toISOString(),
    }));

  const pendingKeys = [...entitledKeys].filter((k) => !computedKeys.has(k));

  return { unlocked, pendingKeys, lockedKeys, totalDimensions: 13, hasAnyComputed: rows.length > 0 };
}

/**
 * The other side of the UNKNOWN loop: `buildInput` above reads these exact
 * lifestyle/family fields, so answering this is what turns a dimension from
 * UNKNOWN into a real score on the next recompute. Returns null once every
 * gap field here is filled — there's simply no question left to ask.
 */
export async function getGapQuestion(userId: string): Promise<GapQuestionDef | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: {
      lifestyle: {
        select: {
          weekendVibe: true,
          bigDecisionStyle: true,
          socialEnergy: true,
          smoking: true,
          drinking: true,
          relocateWilling: true,
        },
      },
      family: { select: { familyValues: true } },
    },
  });
  if (!profile) return null;

  return pickGapQuestion({
    weekendVibe: profile.lifestyle?.weekendVibe ?? null,
    bigDecisionStyle: profile.lifestyle?.bigDecisionStyle ?? null,
    socialEnergy: profile.lifestyle?.socialEnergy ?? null,
    smoking: profile.lifestyle?.smoking ?? null,
    drinking: profile.lifestyle?.drinking ?? null,
    relocateWilling: profile.lifestyle?.relocateWilling ?? null,
    familyValues: profile.family?.familyValues ?? null,
  });
}

/** True when the cached scores predate the profile's own last edit, or don't cover everything the plan now allows. */
export async function needsRecompute(userId: string): Promise<boolean> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { id: true, updatedAt: true } });
  if (!profile) return false;

  const [entitlements, rows] = await Promise.all([
    getEntitlements(userId),
    prisma.profileDimensionScore.findMany({ where: { profileId: profile.id }, select: { dimensionKey: true, computedAt: true } }),
  ]);
  const entitledKeys = getEntitledDimensionKeys(entitlements.deepDimensions);
  const computedKeys = new Set(rows.map((r) => r.dimensionKey));

  const missingEntitled = entitledKeys.some((k) => !computedKeys.has(k));
  if (missingEntitled) return true;

  const staleAgainstProfile = rows.some((r) => r.computedAt < profile.updatedAt);
  return staleAgainstProfile;
}

// ---------------------------------------------------------------------------
// Match-facing view — see docs/bandhantak/10_engagement_and_monetization_architecture.md
// §5.1's follow-up. Everything above this line is self-view only; this is the
// one deliberate, narrow exception, and it earns that exception three separate
// ways rather than one: (1) L3 — mutual match only, the same structural
// promise `getProfileVisibility` already makes for every other private field
// (income, gotra, contact); (2) the *owner's own* opt-in
// (`deepProfileShareEnabled`, defaults false — see schema.prisma), because
// nobody agreed to this when they first ran "Analyze My Profile"; (3) the
// *viewer's* plan — Premium only, the actual paid hook. All three, every
// time; there is no admin override that skips the owner's opt-in.
// ---------------------------------------------------------------------------

/** Owner's own choice, always free regardless of plan — same shape as `setSochBoardVisibility`. */
export async function setDeepProfileShareVisibility(userId: string, visible: boolean): Promise<void> {
  await prisma.profile.update({ where: { userId }, data: { deepProfileShareEnabled: visible } });
}

export async function getDeepProfileShareEnabled(userId: string): Promise<boolean> {
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { deepProfileShareEnabled: true } });
  return profile?.deepProfileShareEnabled ?? false;
}

export type MatchDeepProfileState =
  /** Not L3, or the owner hasn't opted in, or they have nothing computed yet — nothing to show, no upsell either. */
  | { state: "hidden" }
  /** Owner opted in and has a real report, but this viewer's plan doesn't unlock seeing it. */
  | { state: "locked"; computedCount: number }
  | { state: "unlocked"; unlocked: DimensionScoreView[] };

export async function getMatchDeepProfileState(
  viewerUserId: string,
  targetUserId: string,
): Promise<MatchDeepProfileState> {
  if (viewerUserId === targetUserId) return { state: "hidden" };

  const visibility = await getProfileVisibility(viewerUserId, targetUserId);
  if (visibility.level !== "L3") return { state: "hidden" };

  const target = await prisma.profile.findUnique({
    where: { userId: targetUserId },
    select: { deepProfileShareEnabled: true },
  });
  if (!target?.deepProfileShareEnabled) return { state: "hidden" };

  const { unlocked } = await getDeepProfileView(targetUserId);
  if (unlocked.length === 0) return { state: "hidden" };

  const gate = await isFeatureAvailable(
    viewerUserId,
    "deepProfileMatchShare",
    (ctx) => ctx.effectivePlanCode === "PREMIUM",
  );
  if (!gate.allowed) return { state: "locked", computedCount: unlocked.length };

  return { state: "unlocked", unlocked };
}
