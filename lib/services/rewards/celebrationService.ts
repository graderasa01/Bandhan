import "server-only";
import { prisma } from "@/lib/db/prisma";
import { REWARD_LABELS } from "./rewardService";
import { noopT, type Translate } from "@/lib/i18n/translate";
import type { RewardKind } from "@prisma/client";

/**
 * When the app is allowed to be pleased with you.
 *
 * ## The problem this solves
 *
 * Gamified apps celebrate constantly, and it works for them because the stakes
 * are low — a missed Duolingo streak costs nothing, so the app has to supply
 * all the emotion itself. Matrimony is the opposite: the stakes are already
 * enormous and entirely the user's own. Confetti on a routine tap doesn't add
 * delight here, it subtracts seriousness — and the people it costs us most
 * with are the ones who matter most (families, and women evaluating whether
 * this platform is respectable).
 *
 * `components/ui/Celebrate.tsx` already carried that instinct in a comment.
 * This file turns it into a rule the code enforces.
 *
 * ## Three tiers
 *
 * | Tier     | Rendering                | Fires when                              |
 * |----------|--------------------------|-----------------------------------------|
 * | `first`  | Gold confetti burst      | A lifetime first. Once per user, ever.  |
 * | `reward` | Toast + counter tick     | Something repeatable was actually earned |
 * | `micro`  | Haptic + inline pulse    | Routine acknowledgement (client-only)   |
 *
 * ## The three anti-fake rules
 *
 * 1. **Server decides.** A celebration is returned by the API that performed
 *    the state change. The client renders what it is given and cannot invent
 *    one. This is why there is no `celebrate()` helper on the client.
 * 2. **Once means once.** `first` tier is gated by a unique index on
 *    (userId, eventKey), so "pehli baar" is a database guarantee rather than a
 *    thing someone remembered to check.
 * 3. **The copy names the real thing.** Every title below refers to a specific
 *    event with a real referent. No "Amazing!", no "You're on fire!", no
 *    number the user can't verify by looking at their own screen.
 *
 * ## Why the hourly damper exists
 *
 * Two firsts can legitimately land minutes apart (a first voice note that
 * triggers a first mutual match). Two confetti bursts back to back reads as a
 * slot machine, not a milestone. The second one is still *recorded* as
 * celebrated — so it never fires later — but it is delivered as a toast.
 */

const CONFETTI_DAMPER_MS = 60 * 60 * 1000;

export type CelebrationTier = "first" | "reward" | "micro";

export interface Celebration {
  tier: CelebrationTier;
  eventKey: string;
  title: string;
  subtitle?: string;
}

/**
 * Every lifetime-first the app recognises. Adding a key here is a product
 * decision, not a convenience — if an event is not on this list it does not
 * get confetti, full stop.
 */
export const CELEBRATION_FIRSTS = {
  profile_live: {
    title: "Aapki profile live ho gayi",
    subtitle: "Ab aap logon ki Rishta Reel me dikhna shuru ho gaye hain.",
  },
  photo_verified: {
    title: "Photo verify ho gayi",
    subtitle: "Verified photo se aapka trust score badhta hai.",
  },
  first_voice_note_sent: {
    title: "Pehli voice note chali gayi",
    subtitle: "Likhe hue message se aawaz ka jawab zyada aata hai.",
  },
  first_voice_note_received: {
    title: "Kisi ne aapko voice note bheji hai",
    subtitle: "Aapki profile dekh kar kisi ne bolne ka man banaya.",
  },
  first_mutual_match: {
    title: "Pehla mutual match",
    subtitle: "Dono taraf se haan hui hai — ab aap baat kar sakte hain.",
  },
  first_badge: {
    title: "Pehla Vibe Badge mila",
    subtitle: "Ye aapke apne jawaabon se bana hai, kisi guess se nahi.",
  },
  first_contact_shared: {
    title: "Number share ho gaya",
    subtitle: "Dono taraf se haan ke baad hi ye hua hai.",
  },
  first_question_asked: {
    title: "Pehla sawaal poocha",
    subtitle: "Jawab aate hi aapko pata chal jayega.",
  },
  first_question_answered: {
    title: "Pehle sawaal ka jawab diya",
    subtitle: "Jawab dene ke saath aapki pehchaan bhi unhe dikh gayi.",
  },
  first_parent_blessing: {
    title: "Parivaar ka aashirwad mil gaya",
    subtitle: "Ye ab aapki profile par dikhega — ek asli aawaz, verified family member se.",
  },
} as const;

export type CelebrationFirstKey = keyof typeof CELEBRATION_FIRSTS;

/**
 * Records and returns a lifetime-first celebration, or null if this user has
 * already had it.
 *
 * Never throws on the celebration path: a milestone that fails to render is a
 * missed nicety, but an exception here would roll back the actual thing the
 * user just did. Callers pass a transaction client when the celebration must
 * share the fate of the write that caused it — which so far, nothing does.
 */
export async function celebrateFirst(
  userId: string,
  eventKey: CelebrationFirstKey,
  t: Translate = noopT,
): Promise<Celebration | null> {
  const copy = CELEBRATION_FIRSTS[eventKey];
  if (!copy) return null;

  try {
    const recent = await prisma.celebrationLog.findFirst({
      where: { userId, firedAt: { gt: new Date(Date.now() - CONFETTI_DAMPER_MS) } },
      select: { id: true },
    });

    await prisma.celebrationLog.create({ data: { userId, eventKey } });

    return {
      // Recorded either way; only the delivery softens.
      tier: recent ? "reward" : "first",
      eventKey,
      title: t(`celebration.first.${eventKey}.title`, copy.title),
      subtitle: copy.subtitle ? t(`celebration.first.${eventKey}.subtitle`, copy.subtitle) : undefined,
    };
  } catch {
    // Unique violation = already celebrated. Any other DB error is also not
    // worth failing the user's actual action over.
    return null;
  }
}

/**
 * A repeatable, earned thing. Always fires — but only ever as a toast, and
 * only from a call site that has just written a RewardGrant row, so the number
 * in the copy is one the user can go and count.
 */
export function celebrateReward(kind: RewardKind, amount: number, why: string, t: Translate = noopT): Celebration {
  const label = t(`reward.label.${kind}`, REWARD_LABELS[kind]);
  return {
    tier: "reward",
    eventKey: `reward:${kind}`,
    title:
      amount > 1
        ? `${amount} × ${label}${t("celebration.reward.titleSuffixPlural", " mile")}`
        : `${label}${t("celebration.reward.titleSuffixSingular", " mila")}`,
    subtitle: why,
  };
}

/** Has this user already had a given first? For UIs that want to not re-offer it. */
export async function hasCelebrated(userId: string, eventKey: CelebrationFirstKey): Promise<boolean> {
  const row = await prisma.celebrationLog.findUnique({
    where: { userId_eventKey: { userId, eventKey } },
    select: { id: true },
  });
  return Boolean(row);
}
