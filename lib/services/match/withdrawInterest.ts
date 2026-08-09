import "server-only";
import { prisma } from "@/lib/db/prisma";
import { noopT, type Translate } from "@/lib/i18n/translate";

/**
 * Taking back an interest you just sent.
 *
 * The app has always been able to send one and never able to undo it, which
 * makes the reel's RIGHT swipe more final than a swipe should be. This is the
 * undo, and it is deliberately narrow.
 *
 * ## The three rules, and why each one
 *
 *  1. **PENDING only.** Once the other side has answered, the interest is no
 *     longer the sender's to retract — an ACCEPTED one has already become a
 *     Match, and un-declining someone else's decline is not a thing.
 *  2. **Within `WITHDRAW_WINDOW_HOURS`.** A withdrawal a week later reaches
 *     somebody who has already read it, thought about it, and maybe told their
 *     family. At that point removing it explains nothing and only confuses.
 *     Immediately after, it is what it looks like — a change of mind, or a
 *     mis-swipe.
 *  3. **No quota refund.** `sendInterest`'s monthly count is over rows created
 *     this month regardless of status, so a withdrawn interest stays spent.
 *     See that file for why the send→withdraw→send loop must cost twice.
 *
 * ## What withdrawing does *not* do
 *
 * It does not put the person back in the reel. `pipeline.ts` excludes anyone
 * the viewer has swiped (`swipedBy`), and that record is about an action that
 * really happened — withdrawing the interest does not un-see the card.
 */

/** How long after sending an interest can still be taken back. */
export const WITHDRAW_WINDOW_HOURS = 24;

export type WithdrawInterestResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" | "NOT_PENDING" | "TOO_LATE"; message: string };

export async function withdrawInterest(
  userId: string,
  interestId: string,
  t: Translate = noopT,
): Promise<WithdrawInterestResult> {
  const interest = await prisma.interest.findUnique({ where: { id: interestId } });

  // Sender-only. A 404 rather than a 403 for someone else's row: whether an
  // interest exists between two other people is not this caller's business.
  if (!interest || interest.fromUserId !== userId) {
    return { ok: false, error: "NOT_FOUND", message: t("matchReel.withdrawInterest.notFound", "Interest nahi mila.") };
  }

  if (interest.status !== "PENDING") {
    return {
      ok: false,
      error: "NOT_PENDING",
      message:
        interest.status === "WITHDRAWN"
          ? t("matchReel.withdrawInterest.alreadyWithdrawn", "Ye interest pehle hi wapas liya ja chuka hai.")
          : t(
              "matchReel.withdrawInterest.alreadyAnswered",
              "Ispar jawab aa chuka hai, ab wapas nahi liya ja sakta.",
            ),
    };
  }

  const ageHours = (Date.now() - interest.createdAt.getTime()) / 3_600_000;
  if (ageHours > WITHDRAW_WINDOW_HOURS) {
    return {
      ok: false,
      error: "TOO_LATE",
      message: `${t("matchReel.withdrawInterest.tooLate.prefix", "Interest bhejne ke")} ${WITHDRAW_WINDOW_HOURS} ${t(
        "matchReel.withdrawInterest.tooLate.suffix",
        "ghante ke andar hi wapas liya ja sakta hai.",
      )}`,
    };
  }

  // One write, and nothing else to clean up — which is worth stating, because
  // the obvious worry is a stale notification pointing at an interest that no
  // longer exists. There isn't one: sending an interest writes **no Notice at
  // all** (grep `createNotice` — the recipient learns about it from
  // `/user/interests`, not the inbox). The only push that mentions interests is
  // the lifecycle campaign `pendingInterest`, and it selects on
  // `status: "PENDING"` — so flipping this row silently stops that nudge too.
  await prisma.interest.update({ where: { id: interestId }, data: { status: "WITHDRAWN" } });

  return { ok: true };
}
