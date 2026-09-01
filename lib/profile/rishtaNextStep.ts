import { closureLabel, stageRank } from "./rishtaStages";
import type { RishtaOutcome, RishtaStage } from "@prisma/client";

/**
 * One rishta's next step, and whose move it is.
 *
 * The product's whole promise reduces to one sentence on one screen: *"is
 * rishtey mein ab agla sahi kadam kya hai, aur woh kaun karega."* This file is
 * the answer to it, and it is deliberately the smallest possible thing — a
 * chain of `if`s over counts the app already has.
 *
 * ## Why this is not a model call
 *
 * It is tempting to ask Grio "what should they do next", and it would produce a
 * fluent, plausible answer every single time — including for the rishta where
 * nothing has happened and the honest answer is "kuch nahi, unka jawab aana
 * hai". A generated next step cannot say *nothing is owed*, because a model
 * asked for advice always finds advice. This function can, and does: `who:
 * "them"` is a real outcome and it appears above.
 *
 * The second reason is repeatability. The board shows this line for twenty
 * rishtey at once, the Room shows it for one, and Grio reads it aloud. Three
 * surfaces that generate their own wording would disagree with each other in
 * front of the user about their own relationship.
 *
 * ## Why `now` is a parameter
 *
 * "Chhe din se jawab nahi aaya" is the only judgement here that depends on the
 * clock, and a function that reads `Date.now()` internally is one nobody can
 * write a test for. The caller passes the time; this decides.
 *
 * ## The line it will not cross
 *
 * Same line `rishtaStages.ts` draws: nothing here characterises how a rishta is
 * *going*. "Baat achhi chal rahi hai" is not a sentence any count supports.
 * Every string below describes a fact (a message is unread, a topic is
 * unresolved, a meeting has no date) or names a decision the user has not made.
 */

/** Whose move it is. `nobody` is a real answer, and an important one. */
export type NextStepActor = "you" | "them" | "both" | "nobody";

/**
 * Which surface the step lands on. The Room turns this into a button; the
 * board uses it only to pick an icon, which is why `none` is legal.
 */
export type NextStepTarget = "chat" | "topics" | "meeting" | "family" | "stage" | "interests" | "none";

export interface RishtaNextStep {
  who: NextStepActor;
  /** Short enough for a card. No trailing period — it is a label, not prose. */
  title: string;
  /** One line of why. This is where the actual count goes. */
  detail: string;
  target: NextStepTarget;
  /**
   * True when this is something the user is *late* on rather than merely next.
   * The board sorts on it; nothing else does, and it never becomes a red dot
   * on a screen the user did not ask to be nagged from.
   */
  overdue: boolean;
}

export interface RishtaNextStepInput {
  stage: RishtaStage;
  outcome: RishtaOutcome | null;
  interestSent: boolean;
  interestReceived: boolean;
  matched: boolean;
  totalMessages: number;
  awaitingReplyFrom: "user" | "other" | null;
  unresolvedTopics: number;
  hasUpcomingMeeting: boolean;
  hasPastMeeting: boolean;
  familyInvolved: boolean;
  lastInteractionAt: string | null;
}

/**
 * After this many days without a reply, "unka jawab aana hai" stops being true
 * and becomes "unka jawab shayad nahi aayega". Six days rather than three
 * because Indian matrimony conversations routinely pause over a weekend and a
 * three-day nudge would teach the user to ignore the line.
 */
const SILENCE_DAYS = 6;

/** How long a matched-but-silent rishta is allowed to sit before it is the user's move. */
const UNSPOKEN_DAYS = 2;

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * First match wins, and the order is the priority order — a person waiting on a
 * reply outranks a topic that has been unresolved for a month, because one of
 * them has somebody on the other end of it. Same judgement `priorityEngine`
 * encodes across the whole app, applied inside one rishta.
 */
export function nextStepFor(input: RishtaNextStepInput, now: Date = new Date()): RishtaNextStep {
  const idle = daysSince(input.lastInteractionAt, now);

  // ---- Ended -------------------------------------------------------
  if (input.stage === "CLOSED") {
    return {
      who: "nobody",
      title: closureLabel(input.outcome),
      detail: input.outcome
        ? "Ye rishta band ho chuka hai."
        : "Band kiya hua hai — kaise khatam hua, wo darj nahi hai.",
      target: "none",
      overdue: false,
    };
  }

  // ---- Somebody is literally waiting -------------------------------
  if (input.awaitingReplyFrom === "user") {
    return {
      who: "you",
      title: "Aapka jawab baaki hai",
      detail:
        idle === null || idle <= 0
          ? "Unka message aaya hai."
          : `Unka message ${idle} din se jawab ka intezaar kar raha hai.`,
      target: "chat",
      overdue: idle !== null && idle >= 2,
    };
  }

  if (input.interestReceived && !input.matched) {
    return {
      who: "you",
      title: "Inhone interest bheja hai",
      detail: "Haan ya na — dono jawab theek hain, par jawab dena chahiye.",
      target: "interests",
      overdue: true,
    };
  }

  // ---- Sent and waiting --------------------------------------------
  if (input.interestSent && !input.matched) {
    return {
      who: "them",
      title: "Unka jawab aana hai",
      detail: "Aapne interest bhej diya hai. Yahan aapko kuch nahi karna.",
      target: "none",
      overdue: false,
    };
  }

  // ---- Matched, nobody spoke ---------------------------------------
  if (input.matched && input.totalMessages === 0) {
    const waited = idle ?? 0;
    return {
      who: waited >= UNSPOKEN_DAYS ? "you" : "both",
      title: "Baat abhi shuru nahi hui",
      detail:
        waited >= UNSPOKEN_DAYS
          ? "Match hue kuch din ho gaye aur dono chup hain. Pehla message aap bhej dijiye."
          : "Match ho gaya hai. Pehla message koi bhi bhej sakta hai.",
      target: "chat",
      overdue: waited >= UNSPOKEN_DAYS * 3,
    };
  }

  // ---- They have gone quiet ----------------------------------------
  if (input.awaitingReplyFrom === "other" && idle !== null && idle >= SILENCE_DAYS) {
    return {
      who: "you",
      title: "Kaafi din se jawab nahi aaya",
      detail: `Aapka aakhri message ${idle} din pehle gaya tha. Ise band karna hai ya rukna hai — ye aap tay kar sakte hain.`,
      target: "stage",
      overdue: false,
    };
  }

  // ---- Real conversation, real gaps --------------------------------
  if (input.unresolvedTopics > 0 && stageRank(input.stage) >= stageRank("TALKING")) {
    return {
      who: "both",
      title: `${input.unresolvedTopics} ${plural(input.unresolvedTopics, "baat", "baatein")} abhi clear nahi`,
      detail: "Ye wo cheezein hain jinke bina aage ka faisla adhoora rahega.",
      target: "topics",
      overdue: false,
    };
  }

  if (input.stage === "TALKING") {
    return {
      who: "you",
      title: "Tay kijiye ki ye serious hai",
      detail:
        "Baat chal rahi hai. Jab lage ki ye sirf baat nahi hai, to yahi batayiye — uske baad ke kadam khul jaate hain.",
      target: "stage",
      overdue: false,
    };
  }

  if (input.stage === "UNDERSTANDING") {
    if (!input.familyInvolved) {
      return {
        who: "you",
        title: "Ghar par baat karne ka waqt",
        detail: "Aap dono serious hain. Agla kadam ghar walon ka judna hai.",
        target: "family",
        overdue: false,
      };
    }
    return {
      who: "both",
      title: "Milne ka plan banayiye",
      detail: "Ghar walon ko pata hai. Ab ek mulaqat tay honi chahiye.",
      target: "meeting",
      overdue: false,
    };
  }

  if (input.stage === "FAMILY_INVOLVED") {
    if (input.hasUpcomingMeeting) {
      return {
        who: "both",
        title: "Mulaqat tay hai",
        detail: "Tareekh set hai. Milne ke baad yahin par batayiye kya hua.",
        target: "meeting",
        overdue: false,
      };
    }
    return {
      who: "both",
      title: "Milne ka plan banayiye",
      detail: "Ghar wale jud chuke hain. Ab tareekh aur jagah tay karni hai.",
      target: "meeting",
      overdue: false,
    };
  }

  if (input.stage === "MEETING_PLANNED") {
    return {
      who: "both",
      title: input.hasUpcomingMeeting ? "Mulaqat tay hai" : "Mulaqat ki tareekh daaliye",
      detail: input.hasUpcomingMeeting
        ? "Milne ke baad yahin par darj kijiye ki kya hua."
        : "Stage to set hai, par tareekh kahin likhi nahi hai.",
      target: "meeting",
      overdue: !input.hasUpcomingMeeting,
    };
  }

  if (input.stage === "MET") {
    return {
      who: "you",
      title: "Mil chuke hain — ab faisla",
      detail: "Mulaqat ho chuki hai. Aage badhna hai ya nahi, ye sabse imaandar sawaal ab hai.",
      target: "stage",
      overdue: false,
    };
  }

  if (input.stage === "DECISION") {
    return {
      who: "you",
      title: "Faisla darj kijiye",
      detail: "Haan ho ya na — dono is rishtey ka ant hain, aur dono likhe jaane chahiye.",
      target: "stage",
      overdue: false,
    };
  }

  // ---- Nothing owed ------------------------------------------------
  return {
    who: "them",
    title: "Abhi aapko kuch nahi karna",
    detail: "Is rishtey mein agla kadam unki taraf se aana hai.",
    target: "none",
    overdue: false,
  };
}
