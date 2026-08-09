import "server-only";
import { prisma } from "@/lib/db/prisma";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * Mutual contact reveal inside a match.
 *
 * Matching does not hand over a phone number, and neither does chatting. Both
 * people press the button, and only then does each see the other's — M08's
 * rule is that the first contact happens on the platform, where a decline
 * costs nothing and a block still works.
 *
 * The asymmetric state is deliberately representable: one person can have
 * agreed while the other hasn't, and the UI says exactly that instead of
 * pretending nothing has happened. What it must never do is tell the waiting
 * side who is holding it up beyond the plain fact, or reveal a number early.
 */

export interface ContactShareState {
  /** This viewer has agreed to share their own number. */
  iAgreed: boolean;
  /** The other side has agreed to share theirs. */
  theyAgreed: boolean;
  /** Both agreed — numbers exchanged. */
  unlocked: boolean;
  /** The other person's mobile. Null unless `unlocked`, and null if they never verified one. */
  theirMobile: string | null;
}

const LOCKED: ContactShareState = {
  iAgreed: false,
  theyAgreed: false,
  unlocked: false,
  theirMobile: null,
};

export async function getContactShareState(
  matchId: string,
  viewerUserId: string,
): Promise<ContactShareState> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { userAId: true, userBId: true, contactShares: { select: { userId: true } } },
  });

  // Not a participant → the same shape as "nothing shared", so this can never
  // become a probe for whether a match exists.
  if (!match || (match.userAId !== viewerUserId && match.userBId !== viewerUserId)) return LOCKED;

  const otherUserId = match.userAId === viewerUserId ? match.userBId : match.userAId;
  const agreed = new Set(match.contactShares.map((c) => c.userId));

  const iAgreed = agreed.has(viewerUserId);
  const theyAgreed = agreed.has(otherUserId);
  const unlocked = iAgreed && theyAgreed;

  // The number is fetched only once it may be shown — an unlocked-only read,
  // so a locked thread's payload never contains it.
  let theirMobile: string | null = null;
  if (unlocked) {
    const other = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { mobile: true },
    });
    theirMobile = other?.mobile ?? null;
  }

  return { iAgreed, theyAgreed, unlocked, theirMobile };
}

export type ContactShareResult =
  | { ok: true; state: ContactShareState }
  | { ok: false; error: string; message: string; status: number };

/** Idempotent: pressing "haan" twice is not an error, it is the same consent. */
export async function agreeToShareContact(
  matchId: string,
  viewerUserId: string,
  t: Translate = noopT,
): Promise<ContactShareResult> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { userAId: true, userBId: true },
  });

  if (!match || (match.userAId !== viewerUserId && match.userBId !== viewerUserId)) {
    return {
      ok: false,
      error: "NOT_FOUND",
      message: t("matchReel.contactShare.matchNotFound", "Match nahi mila."),
      status: 404,
    };
  }

  const me = await prisma.user.findUnique({
    where: { id: viewerUserId },
    select: { mobile: true, mobileVerifiedAt: true },
  });

  // Consenting to share a number you don't have would leave the other side
  // agreeing into a blank. Refuse early with the reason, rather than unlocking
  // an empty exchange.
  if (!me?.mobile) {
    return {
      ok: false,
      error: "NO_MOBILE",
      message: t(
        "matchReel.contactShare.noMobile",
        "Pehle apna mobile number add karein — tabhi aap share kar sakte hain.",
      ),
      status: 409,
    };
  }

  await prisma.contactShare.upsert({
    where: { matchId_userId: { matchId, userId: viewerUserId } },
    create: { matchId, userId: viewerUserId },
    update: {},
  });

  return { ok: true, state: await getContactShareState(matchId, viewerUserId) };
}

/**
 * Withdraw. Consent that cannot be taken back is not consent — though the copy
 * is honest that a number already seen cannot be un-seen.
 */
export async function withdrawContactShare(
  matchId: string,
  viewerUserId: string,
): Promise<ContactShareResult> {
  await prisma.contactShare.deleteMany({ where: { matchId, userId: viewerUserId } });
  return { ok: true, state: await getContactShareState(matchId, viewerUserId) };
}
