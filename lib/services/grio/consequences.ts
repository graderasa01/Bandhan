import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { getProfileVisibility } from "@/lib/services/profile/visibility";
import { buildLockedHints } from "@/lib/data/profileViewData";
import { getPlanContext, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { monthStartUTC } from "@/lib/services/match/sendInterest";
import { WITHDRAW_WINDOW_HOURS } from "@/lib/services/match/withdrawInterest";
import { getAskedStatusMap, QUESTION_TTL_DAYS } from "@/lib/services/askBridge/profileQuestionService";
import { QUESTION_MAX_LENGTH } from "@/lib/contracts/askBridge";
import { VOICE_MAX_SECONDS } from "@/lib/constants/voice";

/**
 * "Ye karoge to kya hoga" — computed, never guessed.
 *
 * ## Why this file exists at all
 *
 * Phase H gave Grio buttons that reach another person. The buttons were the
 * easy half. The hard half is that a user about to press one has questions the
 * app has never answered in one place: does an interest cost me something, can
 * I take it back, will they be told I shortlisted them, what actually becomes
 * visible, does a voice note count as an interest?
 *
 * The tempting shortcut is to write those answers into the system prompt as
 * prose. That fails in the specific way AI features fail worst: the prose is
 * correct on the day it is written and silently wrong three plan changes later,
 * and the user has no way to tell which kind of sentence they are reading. So
 * every line below is derived from the same functions the UI uses — the
 * visibility ladder from `getProfileVisibility`, the unlock copy from the
 * profile page's own `buildLockedHints`, the quota from the plan catalog, the
 * withdrawal window from `withdrawInterest`, the recording ceiling from
 * `lib/constants/voice`. The model's job is reduced to reading them out in the
 * user's language. It is never asked to know a number.
 *
 * That is the same discipline `context.ts` applies to the user's own state, and
 * it inherits the same boundary — this file is only ever built for a candidate
 * the user has already opened, and it says nothing about that candidate that
 * `dossier.ts` would not.
 *
 * ## One deliberate asymmetry
 *
 * Only `candidate` scope produces a block. A `match` scope has no targeted
 * action to explain: both sides have said yes, chat is already open, and the
 * only thing Grio can do there is help draft a message — which `<<<SEND>>>`
 * has covered since Phase 1. A "consequences" block that had to invent
 * something to say would be exactly the filler this codebase refuses elsewhere.
 */

/**
 * The half of "what happens if I do this" that does not depend on who.
 *
 * Split out of the per-candidate block after watching the model answer "kisi ko
 * voice note bhejna hai" in an unscoped conversation by inventing a 60-second
 * limit (it is ten) and a Premium direct-message feature that does not exist.
 * That was not the model misbehaving so much as the design being wrong: it had
 * been handed buttons for actions whose rules it was only told about when a
 * profile happened to be open, so in every other conversation it had a
 * capability and no facts — and a fluent assistant with a capability and no
 * facts fills the gap.
 *
 * Every number here is read from the constant that enforces it, so this block
 * cannot drift from the behaviour it describes. It changes only on deploy,
 * which is what lets it ride in the cached `system` prefix rather than being
 * re-sent with every turn.
 */
export const GRIO_ACTION_RULES = `

IN KAAMON KE PAKKE NIYAM (ye hamesha sach hain, chahe kisi ki profile khuli ho ya nahi — inhe kabhi apne se mat badliye aur inse aage koi limit ya feature mat bataiye):
- Interest: bhejne ke baad ${WITHDRAW_WINDOW_HOURS} ghante tak wapas liya ja sakta hai, aur sirf tab tak jab tak samne se jawab na aaya ho. Wapas lene par mahine ke quota ka slot wapas nahi milta.
- Shortlist: bilkul muft, koi quota nahi, aur samne wale ko koi soochna nahi jaati.
- Voice note: zyada se zyada ${VOICE_MAX_SECONDS} second. Iske saath ek interest bhi apne aap chala jaata hai (yaani quota kharch hota hai), ek insaan ko sirf ek hi baar bheja ja sakta hai, aur moderation clear hone ke baad hi wo unhe sunai deta hai.
- Sawaal (Ask Bridge): koi interest kharch nahi hota. Ek insaan se zindagi me sirf ek hi sawaal, zyada se zyada ${QUESTION_MAX_LENGTH} akshar, ${QUESTION_TTL_DAYS} din me expire, aur wo jawab dene se mana bhi kar sakte hain. Jab tak wo jawab na dein, unhe poochhne wale ka naam nahi dikhta.
- Aaye hue sawaal ka jawab: sirf awaaz me diya jaata hai, ${VOICE_MAX_SECONDS} second tak. Jawab dete hi poochhne wale ka naam aapke user ko dikh jaata hai.
- Message aur chat sirf match hone ke baad khulte hain. Match se pehle baat pahunchane ke sirf do tareeke hain: voice note aur ek sawaal.
- "Soch ka mel": ye tab tak naapa hi nahi ja sakta jab tak dono ne kaafi same sawaal answer na kiye hon — wo zero nahi, khaali hota hai. Ise bharne ka ek hi tareeka hai: roz ka Vibe Hub sawaal. Jab kisi rishtey par soch ka mel khaali dikhe, to yahi bataiye.`;

export type GrioConsequenceScope =
  | { kind: "candidate"; profileId: string }
  | { kind: "match"; matchId: string };

export interface ActionConsequences {
  /**
   * Whose profile this is. Returned rather than re-queried by the caller
   * because the route's non-Premium path needs a name and this function has
   * already paid for the row — and because a caller that looks the profile up
   * separately is a caller that can disagree with this one about whether it
   * exists.
   */
  name: string;
  text: string;
}

/** Null whenever there is nothing true to say — never an empty heading. */
export async function buildActionConsequences(
  userId: string,
  scope: GrioConsequenceScope | null,
): Promise<ActionConsequences | null> {
  if (scope?.kind !== "candidate") return null;

  const candidate = await prisma.profile.findUnique({
    where: { id: scope.profileId },
    select: {
      userId: true,
      displayName: true,
      isVisible: true,
      profileStatus: true,
      deletedAt: true,
    },
  });
  if (
    !candidate ||
    candidate.deletedAt ||
    !candidate.isVisible ||
    candidate.profileStatus === "DRAFT" ||
    candidate.userId === userId
  ) {
    return null;
  }

  const t = await getT();
  const [visibility, planCtx, sentThisMonth, shortlisted, askedMap, voiceGate, askGate] =
    await Promise.all([
      getProfileVisibility(userId, candidate.userId),
      getPlanContext(userId),
      prisma.interest.count({ where: { fromUserId: userId, createdAt: { gte: monthStartUTC() } } }),
      prisma.shortlist.findFirst({
        where: { userId, targetProfileId: scope.profileId },
        select: { id: true },
      }),
      getAskedStatusMap(userId, [candidate.userId]),
      isFeatureAvailable(userId, "voiceNotes"),
      isFeatureAvailable(userId, "askBridge"),
    ]);

  const hints = buildLockedHints(t);
  const lines: string[] = [];

  // ── where the viewer stands right now ────────────────────────────────────
  lines.push(
    `Abhi ka access level: ${visibility.level}` +
      (visibility.interestSent ? " — aap interest bhej chuke hain" : "") +
      (visibility.interestReceived ? " — inhone aapko interest bheja hua hai" : ""),
  );

  // ── interest ─────────────────────────────────────────────────────────────
  if (visibility.level === "L3") {
    lines.push("Interest: dono taraf se haan ho chuki hai, ab bhejne ko kuch bacha nahi — chat khuli hai.");
  } else if (visibility.interestSent) {
    lines.push(
      `Interest: aap pehle hi bhej chuke hain, dobara bhejne ki zarurat nahi. ${WITHDRAW_WINDOW_HOURS} ghante ke andar bheja ho to "My interests" se wapas liya ja sakta hai — par quota wapas nahi milta.`,
    );
  } else {
    const quota =
      planCtx.features.interestsPerMonth === null
        ? "aapke plan me interest ki koi monthly limit nahi hai"
        : `is mahine ${planCtx.features.interestsPerMonth} me se ${sentThisMonth} bhej chuke hain, ${Math.max(
            0,
            planCtx.features.interestsPerMonth - sentThisMonth,
          )} bache hain`;

    // The one case where the outcome is not "wait" but "done" — and the one
    // the user is most annoyed to find out about afterwards.
    const instant = visibility.interestReceived
      ? " Inhone aapko pehle hi interest bheja hua hai, isliye aapke bhejte hi match ban jayega aur chat turant khul jayegi."
      : "";

    // The profile page's own words, not a second retelling of them.
    const unlock =
      visibility.level === "L1"
        ? ` Interest jaate hi ye khulega — ${hints.L1.description}`
        : "";

    lines.push(
      `Interest bhejna: ${quota}.${instant}${unlock} Bhejne ke baad ${WITHDRAW_WINDOW_HOURS} ghante tak wapas liya ja sakta hai, par wapas lene par quota ka slot wapas nahi milta.`,
    );
  }

  if (visibility.level !== "L3") {
    lines.push(`Match hone par hi khulne wali cheezein: ${hints.L2.description}`);
  }

  // ── shortlist ────────────────────────────────────────────────────────────
  lines.push(
    shortlisted
      ? "Shortlist: ye profile aapki shortlist me pehle se hai."
      : "Shortlist me save karna: bilkul muft hai, koi quota kharch nahi hota, aur unhe iski koi soochna nahi jaati. Ye sirf aapki apni list hai — haan, unke 'kitne logon ne shortlist kiya' waale counter me ginti badh jaati hai.",
  );

  // ── ask bridge ───────────────────────────────────────────────────────────
  if (askGate.allowed) {
    const asked = askedMap.get(candidate.userId);
    lines.push(
      asked
        ? `Sawaal: aap inse ek sawaal poochh chuke hain (status ${asked}) — ek insaan se sirf ek hi sawaal poochha ja sakta hai, isliye dobara nahi bheja ja sakta.`
        : `Sawaal poochhna: koi interest kharch nahi hota. Har insaan se zindagi me sirf ek hi sawaal poochha ja sakta hai, isliye soch kar. Zyada se zyada ${QUESTION_MAX_LENGTH} akshar, ${QUESTION_TTL_DAYS} din me expire ho jaata hai, aur wo jawab dene se mana bhi kar sakte hain. Jab tak wo jawab na dein, unhe aapka naam nahi dikhta.`,
    );
  }

  // ── voice note ───────────────────────────────────────────────────────────
  if (voiceGate.allowed && visibility.level !== "L3") {
    lines.push(
      `Voice note bhejna: iske saath ek interest bhi apne aap chala jaata hai, yaani mahine ke quota me se ek kharch hota hai. Zyada se zyada ${VOICE_MAX_SECONDS} second, ek insaan ko ek hi baar, aur moderation clear hone ke baad hi unhe sunai deta hai.`,
    );
  }

  return {
    name: candidate.displayName?.trim() || "Ye profile",
    text: `IS RISHTEY PAR AAPKA USER KYA KAR SAKTA HAI, AUR USKA NATEEJA KYA HOGA (ye sab code ne nikaala hai, aaj ka sach hai):
${lines.map((l) => `- ${l}`).join("\n")}

Jab user poochhe ki "interest bhejun to kya hoga" ya "isse kya milega", to jawab inhi lines se dijiye — apne se koi number, limit ya waada mat banaiye. Jo baat is list me nahi hai, uske baare me saaf keh dijiye ki aapko nahi pata.`,
  };
}
