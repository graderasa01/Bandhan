import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROFILE_FULL_INCLUDE } from "@/lib/services/profile/profileInclude";
import { liveWeights, loadMatchSignals, scoreCandidates } from "./pipeline";
import { describeSochFit } from "./sochFit";
import type { ProfileWithSubTables } from "@/lib/services/profile/completionService";

/**
 * "Ye rishta kyun dikha?" — the ranking the app already did, shown to the
 * person it was done for.
 *
 * ## Why this recomputes instead of reading `DailyReelProfile`
 *
 * Every number here is already persisted on `daily_reel_profiles` for anyone
 * who arrived through the reel, so reading that row would be one cheap query.
 * It is still the wrong source, for two reasons that both bite in practice:
 *
 *  - **Most profile views are not reel views.** Shortlist, Serious Circle, a
 *    link from the inbox, a family portal card — none of those create a
 *    `DailyReelProfile` row. A card that appears for reel arrivals and silently
 *    vanishes everywhere else reads as a bug, not as a feature with a
 *    precondition.
 *  - **The row is a snapshot.** It was written when the reel was generated;
 *    the candidate may have answered six polls since. Showing yesterday's soch
 *    fit next to today's Vibe Hub streak is exactly the kind of two-parts-of-
 *    the-app-disagreeing that `visibility.ts` and `candidateFacts.ts` exist to
 *    prevent.
 *
 * So it calls `scoreCandidates` — the same function that ranks — with a
 * one-element array. The number the user reads is not a copy of the ranking
 * number; it *is* the ranking number, computed the same way, and it cannot
 * drift from D-33 because there is nothing here to drift.
 *
 * ## Cost
 *
 * Two profile reads plus `loadMatchSignals`'s two indexed queries, then pure
 * TS. No AI call — this whole file is deliberately free of one, which is what
 * lets the card ship to FREE users. The AI half is `lib/services/grio/dossier.ts`.
 */

export type FitSignalKey = "preference" | "trust" | "activity" | "soch";

export interface FitSignal {
  key: FitSignalKey;
  label: string;
  /** 0..100 — the raw signal score, before weighting. */
  score: number;
  /** How much this signal counted toward the final ranking for *this* pair. */
  weightPercent: number;
  /** One honest line about what the number means. Code's, never a model's. */
  hint: string;
}

export interface FitBreakdown {
  signals: FitSignal[];
  /**
   * Null when this pair shares no thinking data — a missing signal, never a
   * zero. `computeSochFit` makes the same distinction and the UI must keep it:
   * rendering an empty bar would assert "you two think differently", which is
   * not what the absence of data means.
   */
  sochAvailable: boolean;
  /**
   * A sentence the user could verify by counting, e.g. "7 me se 5 sawaalon par
   * ek jaisa jawab". Null when the only contributing source was the inferred
   * dimensions — see `describeSochFit`.
   */
  sochLine: string | null;
  /** Whether the viewer has run their own Deep Profile analysis yet. */
  viewerHasDimensions: boolean;
}

const HINTS: Record<FitSignalKey, string> = {
  preference:
    "Aapne jeevansaathi ke liye jo likha hai — sheher, shiksha, dharm/jaati ki apeksha, deal breakers — usse kitna mel khaata hai.",
  trust: "Inki profile kitni verify aur poori hai. Ye inka apna trust score hai, aapse iska koi lena-dena nahi.",
  activity: "Ye haal me kitne active rahe hain. Jo log abhi platform par aa rahe hain, unka jawab jaldi milta hai.",
  soch: "Aap dono ne Vibe Hub ke poll aur soch wale sawaalon par kitna ek jaisa jawab diya.",
};

/**
 * Null when the pair cannot be scored at all — no viewer profile, no candidate,
 * the candidate is a draft/hidden/deleted, or the viewer is looking at
 * themselves. Every one of those is a normal state the caller renders as
 * "nothing here", not an error.
 */
export async function getFitBreakdown(
  viewerUserId: string,
  candidateProfileId: string,
): Promise<FitBreakdown | null> {
  const [viewer, candidate] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: viewerUserId }, include: PROFILE_FULL_INCLUDE }),
    prisma.profile.findUnique({ where: { id: candidateProfileId }, include: PROFILE_FULL_INCLUDE }),
  ]);

  if (!viewer || !candidate) return null;
  if (viewer.userId === candidate.userId) return null;
  if (candidate.deletedAt || !candidate.isVisible || candidate.profileStatus === "DRAFT") return null;

  return computeFitBreakdown(viewer, candidate);
}

/** Split out so `dossier.ts` can reuse profiles it has already loaded. */
export async function computeFitBreakdown(
  viewer: ProfileWithSubTables,
  candidate: ProfileWithSubTables,
): Promise<FitBreakdown> {
  const signals = await loadMatchSignals([viewer, candidate]);
  const [scored] = scoreCandidates(viewer, [candidate], signals);

  const hasSoch = scored.sochFit !== null;
  const w = liveWeights(hasSoch);

  const rows: FitSignal[] = [
    {
      key: "preference",
      label: "Aapki pasand se mel",
      score: Math.round(scored.preferenceScore),
      weightPercent: Math.round(w.preference * 100),
      hint: HINTS.preference,
    },
    {
      key: "trust",
      label: "Bharosa",
      score: Math.round(scored.trustScoreFactor),
      weightPercent: Math.round(w.trust * 100),
      hint: HINTS.trust,
    },
    {
      key: "activity",
      label: "Kitne active hain",
      score: Math.round(scored.recentActivityScore),
      weightPercent: Math.round(w.recentActivity * 100),
      hint: HINTS.activity,
    },
  ];

  if (hasSoch && scored.sochFit) {
    rows.push({
      key: "soch",
      label: "Soch ka mel",
      score: Math.round(scored.sochFit.score),
      weightPercent: Math.round(w.deep * 100),
      hint: HINTS.soch,
    });
  }

  return {
    signals: rows,
    sochAvailable: hasSoch,
    sochLine: scored.sochFit ? describeSochFit(scored.sochFit) : null,
    viewerHasDimensions: (signals.dimensionScores?.get(viewer.id) ?? null) !== null,
  };
}
