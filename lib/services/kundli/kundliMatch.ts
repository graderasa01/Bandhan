import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { GunaMilan, KundliChart, KundliMatchView } from "@/lib/contracts/kundli";
import { buildChart, moonPositionFor, type MoonPosition } from "./chart";
import { computeGunaMilan } from "./gunaMilan";
import { getKundliNotes } from "./kundliService";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * The only place kundli logic meets the database — and therefore the only place
 * the privacy promise on birth details can be broken. It is written so that it
 * cannot be.
 *
 * `lib/profile/fields.ts` tells the user, at the moment they type it: *"birth
 * time / birth place — sirf kundli ke liye, kisi aur ko kabhi nahi dikhta."*
 * Two rules keep that true:
 *
 *  1. **`getOwnChart` is self-only by construction.** It takes a `userId` and
 *     reads that user's row. There is no variant that takes someone else's id,
 *     so no route can accidentally serve a stranger's lagna.
 *  2. **The match path never materialises the other person's chart.** It calls
 *     `moonPositionFor`, which returns a rashi and a nakshatra and nothing
 *     else. Those are conclusions drawn from birth data, not the birth data —
 *     the same standing as the manglik note that has always been shown.
 *
 * Nothing here returns a score to `pipeline.ts`. Guna milan is shown about a
 * profile the viewer already chose to open; it never decides which profiles
 * they see.
 */

const PROFILE_SELECT = {
  gender: true,
  dateOfBirth: true,
  basicDetails: {
    select: { birthTime: true, birthPlace: true, gotra: true, manglikStatus: true },
  },
} as const;

type ProfileRow = {
  gender: string | null;
  dateOfBirth: Date | null;
  basicDetails: {
    birthTime: string | null;
    birthPlace: string | null;
    gotra: string | null;
    manglikStatus: string | null;
  } | null;
};

function moonOf(row: ProfileRow): MoonPosition | null {
  return moonPositionFor({
    dateOfBirth: row.dateOfBirth,
    birthTime: row.basicDetails?.birthTime,
    birthPlace: row.basicDetails?.birthPlace,
  });
}

/** "Ladka" → boy. Anything else that is set → girl. Null when unstated. */
function sideOf(gender: string | null): "boy" | "girl" | null {
  if (!gender) return null;
  return gender.trim().toLowerCase() === "ladka" ? "boy" : "girl";
}

/** The signed-in user's own natal chart. Never callable for anyone else. */
export async function getOwnChart(userId: string): Promise<KundliChart | null> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: PROFILE_SELECT,
  });
  if (!profile) return null;

  return buildChart({
    dateOfBirth: profile.dateOfBirth,
    birthTime: profile.basicDetails?.birthTime,
    birthPlace: profile.basicDetails?.birthPlace,
  });
}

/**
 * Guna milan between the signed-in user and one candidate profile.
 *
 * Returns `milan: null` with a reason rather than throwing, because "milan
 * nahi ban sakta" is a normal state the UI turns into a prompt ("apni DOB bhar
 * dijiye") — not an error.
 */
export async function getKundliMatchView(
  viewerUserId: string,
  candidateProfileId: string,
  t: Translate = noopT,
): Promise<KundliMatchView> {
  const [viewer, candidate] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: viewerUserId }, select: PROFILE_SELECT }),
    prisma.profile.findUnique({ where: { id: candidateProfileId }, select: PROFILE_SELECT }),
  ]);

  const notes = getKundliNotes(
    { gotra: viewer?.basicDetails?.gotra, manglikStatus: viewer?.basicDetails?.manglikStatus },
    {
      gotra: candidate?.basicDetails?.gotra,
      manglikStatus: candidate?.basicDetails?.manglikStatus,
    },
    t,
  );

  if (!viewer?.dateOfBirth) return { notes, milan: null, milanBlockedReason: "viewer-missing-dob" };
  if (!candidate?.dateOfBirth) {
    return { notes, milan: null, milanBlockedReason: "candidate-missing-dob" };
  }

  const milan = milanBetween(viewer, candidate, t);
  return {
    notes,
    milan,
    milanBlockedReason: milan ? null : "same-gender",
  };
}

/**
 * Shared by the match view and the standalone kundli page.
 *
 * Three of the eight kootas are asymmetric — Varna compares ranks in one
 * direction, Vashya and Gana read off asymmetric grids — so which Moon is the
 * boy's is not a cosmetic detail. When both profiles state the same gender
 * there is no defensible way to assign the roles, so this returns null rather
 * than picking one and printing a number that would flip if the arguments
 * were swapped.
 */
export function milanBetween(a: ProfileRow, b: ProfileRow, t: Translate = noopT): GunaMilan | null {
  const aSide = sideOf(a.gender);
  const bSide = sideOf(b.gender);
  if (!aSide || !bSide || aSide === bSide) return null;

  const aMoon = moonOf(a);
  const bMoon = moonOf(b);
  if (!aMoon || !bMoon) return null;

  return aSide === "boy" ? computeGunaMilan(aMoon, bMoon, t) : computeGunaMilan(bMoon, aMoon, t);
}

/**
 * Whether either side's Moon had to be taken from local noon — the caller
 * shows a "birth time bhar dijiye" nudge when true. Kept separate from
 * `GunaMilan` because it is a property of the *inputs*, not of the result, and
 * folding it in would tempt someone to render it as a confidence score.
 */
export async function milanUsedAssumedTime(
  viewerUserId: string,
  candidateProfileId: string,
): Promise<{ viewerAssumed: boolean; candidateAssumed: boolean }> {
  const [viewer, candidate] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: viewerUserId }, select: PROFILE_SELECT }),
    prisma.profile.findUnique({ where: { id: candidateProfileId }, select: PROFILE_SELECT }),
  ]);
  return {
    viewerAssumed: viewer ? (moonOf(viewer)?.approximate ?? true) : true,
    candidateAssumed: candidate ? (moonOf(candidate)?.approximate ?? true) : true,
  };
}

export interface MatchMilanRow {
  profileId: string;
  name: string;
  /** Null when no score could be computed — `blocked` says why. */
  total: number | null;
  band: string | null;
  hasDosha: boolean;
  /**
   * True when either side's Moon came from local noon because a birth time
   * was missing. A property of the inputs, not of the score (see
   * `milanUsedAssumedTime`), surfaced per row so the list can say so.
   */
  assumedTime: boolean;
  /**
   * Why there is no score. "missing-data" covers a candidate with no date of
   * birth or an unstated gender on either side — the UI says the pair lacks
   * the jaankari, and never invents a number in its place.
   */
  blocked: "missing-data" | null;
}

/**
 * Guna milan against everyone the user has **already matched with**.
 *
 * Restricted to matches on purpose. Running milan across the discovery pool
 * would turn it into a ranking of strangers by astrology — which is exactly
 * the line `pipeline.ts` is kept clear of. A match is a pair who have both
 * already said yes; telling them what the tradition makes of their kundlis is
 * information about a decision already taken, not a filter on who they meet.
 */
export async function getMatchMilanList(userId: string, t: Translate = noopT): Promise<MatchMilanRow[]> {
  const viewer = await prisma.profile.findUnique({
    where: { userId },
    select: PROFILE_SELECT,
  });
  if (!viewer?.dateOfBirth) return [];

  const matches = await prisma.match.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });
  const otherIds = matches.map((m) => (m.userAId === userId ? m.userBId : m.userAId));
  if (otherIds.length === 0) return [];

  const others = await prisma.profile.findMany({
    where: { userId: { in: otherIds }, deletedAt: null },
    select: { ...PROFILE_SELECT, id: true, displayName: true, user: { select: { fullName: true } } },
  });

  const viewerAssumed = moonOf(viewer)?.approximate ?? true;
  const viewerSide = sideOf(viewer.gender);

  const rows: MatchMilanRow[] = [];
  for (const other of others) {
    const name = other.displayName ?? other.user.fullName;
    const otherSide = sideOf(other.gender);
    // Same stated gender on both sides: the eight kootas have no defensible
    // role assignment (see `milanBetween`), and it is not a data gap the
    // user can fill — so the pair is left out rather than labelled.
    if (viewerSide && otherSide && viewerSide === otherSide) continue;

    const milan = milanBetween(viewer, other, t);
    if (!milan) {
      rows.push({
        profileId: other.id,
        name,
        total: null,
        band: null,
        hasDosha: false,
        assumedTime: false,
        blocked: "missing-data",
      });
      continue;
    }
    const otherAssumed = moonOf(other)?.approximate ?? true;
    rows.push({
      profileId: other.id,
      name,
      total: milan.total,
      band: milan.band,
      hasDosha: milan.dosha.length > 0,
      assumedTime: viewerAssumed || otherAssumed,
      blocked: null,
    });
  }
  // Scored rows first, highest total on top; rows without a score sit at the
  // end, where "jaankari poori nahi" reads as a prompt rather than a verdict.
  return rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
}
