import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { getProfileVisibility } from "@/lib/services/profile/visibility";
import { isBlockedEitherWay } from "@/lib/services/safety/blockService";
import { getStoredSignalAnswers } from "@/lib/services/profile/intelligenceService";
import { effectiveSignals, type SignalAnswerMap } from "@/lib/profile/signalAnswers";
import { buildCandidateFacts } from "@/lib/services/match/candidateFacts";
import { getKundliMatchView } from "@/lib/services/kundli/kundliMatch";
import { getAskedStatusMap } from "@/lib/services/askBridge/profileQuestionService";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { buildGrioProfileCards } from "@/lib/services/grio/cards";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";
import type { GrioProfileHeader } from "@/lib/contracts/grioProfile";
import { buildProfileEvidence } from "./evidence";
import { buildProfileSections } from "./sections";
import type { ProfileTurnFacts } from "./answers";

/**
 * "This profile" — resolved from an id, on the server, under the same rules the
 * profile page applies. Never from what a screen happened to render.
 *
 * The reel sends a profile id and nothing else. Everything Grio then knows
 * about that person is read here, from the database, cut to what *this*
 * viewer may see:
 *
 *   • gone, hidden, a draft, or the viewer themselves → nothing to talk about
 *   • **blocked in either direction** → nothing to talk about, and the answer
 *     says only "not available" (never which side blocked — being told you were
 *     blocked is itself a message, see blockService.ts)
 *   • the viewer's L1/L2/L3 level decides every field (`buildCandidateFacts`)
 *   • the photo only through the same gate the chat's profile cards use
 *
 * The older Rishta Lens dossier (dossier.ts) skipped the block check; a profile
 * turn cannot, because it is reachable from any reel card id a client sends.
 */

export type ProfileContextError = "not_found" | "blocked" | "self" | "no_viewer_profile";

export interface LoadedProfileTurn {
  facts: ProfileTurnFacts;
  header: GrioProfileHeader;
  viewer: ProfileWithSubTables;
  candidate: ProfileWithSubTables;
  viewerSignals: SignalAnswerMap;
  candidateSignals: SignalAnswerMap;
}

const LEVEL_LABEL: Record<"L1" | "L2" | "L3", string> = {
  L1: "Shuruaati jaankari",
  L2: "Interest ke baad",
  L3: "Match",
};

export async function loadProfileTurn(
  viewerUserId: string,
  profileId: string,
  opts: { withKundli?: boolean } = {},
): Promise<{ ok: true; turn: LoadedProfileTurn } | { ok: false; error: ProfileContextError }> {
  const candidate = await prisma.profile.findUnique({ where: { id: profileId }, include: PROFILE_FULL_INCLUDE });
  if (!candidate || candidate.deletedAt || !candidate.isVisible || candidate.profileStatus === "DRAFT") {
    return { ok: false, error: "not_found" };
  }
  if (candidate.userId === viewerUserId) return { ok: false, error: "self" };

  const [viewer, blocked] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: viewerUserId }, include: PROFILE_FULL_INCLUDE }),
    isBlockedEitherWay(viewerUserId, candidate.userId),
  ]);
  if (blocked) return { ok: false, error: "blocked" };
  if (!viewer) return { ok: false, error: "no_viewer_profile" };

  // The visibility level and the two answer maps are load-bearing — without
  // them there is no safe answer, so their failure fails the turn. Everything
  // else is a *tool*: a kundli computation, the header card, the Ask Bridge
  // state. A tool that throws degrades to "not available" (the kundli answer
  // says so; the header falls back to the name) instead of taking the whole
  // answer down with it.
  const soft = <T,>(label: string, p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((err) => {
      console.error(`[grio:profile] tool ${label} failed:`, err instanceof Error ? err.message : String(err));
      return fallback;
    });
  const [visibility, candidateStored, viewerStored, cards, asked, askGate, kundli, shortlist] = await Promise.all([
    getProfileVisibility(viewerUserId, candidate.userId),
    getStoredSignalAnswers(candidate.id),
    getStoredSignalAnswers(viewer.id),
    soft("profileCard", buildGrioProfileCards(viewerUserId, [candidate.id]), []),
    soft("askedStatus", getAskedStatusMap(viewerUserId, [candidate.userId]), new Map()),
    soft("askBridgeGate", isFeatureAvailable(viewerUserId, "askBridge"), { allowed: false } as Awaited<ReturnType<typeof isFeatureAvailable>>),
    opts.withKundli ? soft("kundli", getKundliMatchView(viewerUserId, candidate.id), null) : Promise.resolve(null),
    soft(
      "shortlist",
      prisma.shortlist.findUnique({
        where: { userId_targetProfileId: { userId: viewerUserId, targetProfileId: candidate.id } },
        select: { id: true },
      }),
      null,
    ),
  ]);

  const candidateSignals = effectiveSignals(candidate, candidateStored);
  const viewerSignals = effectiveSignals(viewer, viewerStored);
  const level = visibility.level;

  // The one field list. Everything Grio can say about this person starts here.
  const candidateFacts = buildCandidateFacts(candidate, level, candidateSignals);
  const sections = buildProfileSections(candidateFacts);
  const evidence = buildProfileEvidence({ viewer, candidate, level, viewerSignals, candidateSignals });

  const card = cards[0] ?? null;
  const name = candidate.displayName?.trim() || "Ye profile";
  const education = candidate.education?.highestEducation?.trim() || null;
  const job = candidate.profession?.jobTitle?.trim() || candidate.profession?.professionCategory?.trim() || null;

  const header: GrioProfileHeader = {
    profileId: candidate.id,
    name,
    age: card?.age ?? null,
    city: candidate.currentCity?.trim() || null,
    headline: [education, job].filter(Boolean).join(" · ") || null,
    photoUrl: card?.photoUrl ?? null,
    photoLock: card?.photoLock ?? "match_only",
    verified: card?.verified ?? false,
    level,
    levelLabel: LEVEL_LABEL[level],
    matchId: visibility.matchId,
    chatOpen: card?.chatOpen ?? false,
  };

  const facts: ProfileTurnFacts = {
    profileId: candidate.id,
    name,
    level,
    sections,
    evidence,
    kundli,
    relationship: {
      interestSent: visibility.interestSent,
      interestReceived: visibility.interestReceived,
      matchId: visibility.matchId,
      chatOpen: card?.chatOpen ?? false,
      shortlisted: Boolean(shortlist),
      askedStatus: asked.get(candidate.userId) ?? "NONE",
      askBridgeEnabled: askGate.allowed,
      hasVoiceNote: false,
    },
  };

  return { ok: true, turn: { facts, header, viewer, candidate, viewerSignals, candidateSignals } };
}

/** What a member reads when a profile cannot be discussed — the same sentence for every reason. */
export const PROFILE_UNAVAILABLE_MESSAGE = "Ye profile abhi available nahi hai.";
