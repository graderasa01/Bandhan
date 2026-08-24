import { prisma } from "@/lib/db/prisma";
import {
  deriveStage,
  effectiveStage,
  nextStages,
  requiresConfirmation,
  stageRank,
  RISHTA_STAGE_LABEL,
  type RishtaSignals,
} from "@/lib/profile/rishtaStages";
import type { RishtaStage } from "@prisma/client";

/**
 * One rishta, remembered.
 *
 * `lib/profile/rishtaStages.ts` decides what a stage *means* and stays pure.
 * This file is what actually happened between two specific people — and, more
 * importantly, it is the only place allowed to answer "hum kahan tak aaye the".
 *
 * No `server-only` marker, matching `intelligenceService.ts` and
 * `familyExpectationService.ts` for the reason those state: the marker locks the
 * module out of `scripts/`, and a verification that exercises a copy of the
 * write path is not a verification.
 *
 * ## Every fact here has a row behind it
 *
 * That is the rule this whole feature stands on. A language model asked "what
 * did we discuss?" will produce a confident, plausible, entirely invented
 * answer — and it will do it in the one place a user has no way to check,
 * because they are asking precisely *because* they cannot remember. So nothing
 * in this summary is generated: message counts are counted, the last
 * interaction is a timestamp, unresolved topics are rows the user or the
 * compatibility comparison created, and reflections are the user's own words.
 *
 * Grio reads this and rephrases it. It never adds to it.
 *
 * ## Per-user, always
 *
 * `userId` is whose journey this is. Rahul's record of a rishta and Priya's are
 * separate rows and neither can read the other — see the model docstring for
 * why a shared row would both overwrite and leak.
 */

/* ------------------------------------------------------------------ */
/* Signals                                                             */
/* ------------------------------------------------------------------ */

/**
 * The events derivation is allowed to see, fetched for one pair.
 *
 * Five indexed reads in parallel. Worth noting what is *not* here: message
 * bodies. The stage question is "did both sides speak", which a count answers,
 * and pulling transcripts into a summary that Grio reads would put a chat log
 * in a prompt for no gain.
 */
async function loadSignals(userId: string, otherUserId: string): Promise<RishtaSignals & { matchId: string | null; lastInteractionAt: Date | null; lastSenderId: string | null }> {
  const [interestSent, interestReceived, match, fromUser, fromOther, familyShortlist, familyNote, lastMessage] =
    await Promise.all([
      prisma.interest.findUnique({
        where: { fromUserId_toUserId: { fromUserId: userId, toUserId: otherUserId } },
        select: { id: true },
      }),
      prisma.interest.findUnique({
        where: { fromUserId_toUserId: { fromUserId: otherUserId, toUserId: userId } },
        select: { id: true },
      }),
      prisma.match.findFirst({
        where: {
          OR: [
            { userAId: userId, userBId: otherUserId },
            { userAId: otherUserId, userBId: userId },
          ],
        },
        select: { id: true },
      }),
      prisma.message.count({
        where: { senderId: userId, match: { OR: [{ userAId: otherUserId }, { userBId: otherUserId }] } },
      }),
      prisma.message.count({
        where: { senderId: otherUserId, match: { OR: [{ userAId: userId }, { userBId: userId }] } },
      }),
      // Family touched them: a shortlist the family added, or a note they wrote.
      prisma.shortlist.findFirst({
        where: { userId, addedByFamilyMemberId: { not: null }, targetProfile: { userId: otherUserId } },
        select: { id: true },
      }),
      prisma.familyNote.findFirst({
        where: { familyMember: { ownerUserId: userId }, targetProfile: { userId: otherUserId } },
        select: { id: true },
      }),
      prisma.message.findFirst({
        where: {
          match: {
            OR: [
              { userAId: userId, userBId: otherUserId },
              { userAId: otherUserId, userBId: userId },
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, senderId: true },
      }),
    ]);

  return {
    interestSent: interestSent !== null,
    interestReceived: interestReceived !== null,
    matched: match !== null,
    messagesFromUser: fromUser,
    messagesFromOther: fromOther,
    familyTouched: familyShortlist !== null || familyNote !== null,
    matchId: match?.id ?? null,
    lastInteractionAt: lastMessage?.createdAt ?? null,
    lastSenderId: lastMessage?.senderId ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* The summary                                                         */
/* ------------------------------------------------------------------ */

export interface RishtaSummary {
  otherUserId: string;
  name: string;
  matchId: string | null;
  stage: RishtaStage;
  stageLabel: string;
  /** True when the user said so; false when it was read off events. */
  stageConfirmed: boolean;
  /** What the user may move to next. Empty once CLOSED. */
  nextStages: { stage: RishtaStage; label: string }[];
  closedReason: string | null;

  messagesFromUser: number;
  messagesFromOther: number;
  lastInteractionAt: string | null;
  /**
   * Whose turn it is, by the only measure that does not require reading the
   * messages: who spoke last. Null when nobody has.
   */
  awaitingReplyFrom: "user" | "other" | null;

  familyInvolved: boolean;
  questionsAsked: number;
  questionsAnswered: number;

  unresolvedTopics: { id: string; label: string; questionKey: string | null }[];
  resolvedTopics: { id: string; label: string; outcome: string | null }[];
  meetings: { id: string; scheduledFor: string | null; happenedAt: string | null; place: string | null }[];
  reflections: { id: string; body: string; createdAt: string }[];
}

/** Beyond this a summary stops being a summary. */
const MAX_REFLECTIONS = 5;

/**
 * Null when these two have no relationship at all — no interest either way, no
 * match, no messages. Callers render nothing rather than an empty journey.
 */
export async function getRishtaSummary(userId: string, otherUserId: string): Promise<RishtaSummary | null> {
  if (userId === otherUserId) return null;

  const [signals, journey, other, questions] = await Promise.all([
    loadSignals(userId, otherUserId),
    prisma.rishtaJourney.findUnique({
      where: { userId_otherUserId: { userId, otherUserId } },
      include: {
        topics: { orderBy: { createdAt: "asc" } },
        meetings: { orderBy: { createdAt: "desc" } },
        reflections: { orderBy: { createdAt: "desc" }, take: MAX_REFLECTIONS },
      },
    }),
    prisma.profile.findUnique({ where: { userId: otherUserId }, select: { displayName: true } }),
    prisma.profileQuestion.findMany({
      where: {
        OR: [
          { fromUserId: userId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: userId },
        ],
      },
      select: { status: true },
    }),
  ]);

  const derived = deriveStage(signals);
  const hasAnything =
    signals.interestSent ||
    signals.interestReceived ||
    signals.matched ||
    journey !== null ||
    questions.length > 0;
  if (!hasAnything) return null;

  const stage = effectiveStage(derived, journey?.confirmedStage ?? null);

  return {
    otherUserId,
    name: other?.displayName?.trim() || "Ye rishta",
    matchId: signals.matchId,
    stage,
    stageLabel: RISHTA_STAGE_LABEL[stage],
    // Confirmed only when the stored stage is what is actually showing —
    // a confirmation the derivation has since overtaken is history, not a claim.
    stageConfirmed:
      journey?.confirmedStage !== undefined &&
      journey?.confirmedStage !== null &&
      stageRank(journey.confirmedStage) >= stageRank(derived),
    nextStages: nextStages(stage).map((s) => ({ stage: s, label: RISHTA_STAGE_LABEL[s] })),
    closedReason: journey?.closedReason ?? null,

    messagesFromUser: signals.messagesFromUser,
    messagesFromOther: signals.messagesFromOther,
    lastInteractionAt: signals.lastInteractionAt?.toISOString() ?? null,
    awaitingReplyFrom:
      signals.lastSenderId === null ? null : signals.lastSenderId === userId ? "other" : "user",

    familyInvolved: signals.familyTouched || stageRank(stage) >= stageRank("FAMILY_INVOLVED"),
    questionsAsked: questions.length,
    questionsAnswered: questions.filter((q) => q.status === "ANSWERED").length,

    unresolvedTopics: (journey?.topics ?? [])
      .filter((t) => !t.resolved)
      .map((t) => ({ id: t.id, label: t.label, questionKey: t.questionKey })),
    resolvedTopics: (journey?.topics ?? [])
      .filter((t) => t.resolved)
      .map((t) => ({ id: t.id, label: t.label, outcome: t.outcome })),
    meetings: (journey?.meetings ?? []).map((m) => ({
      id: m.id,
      scheduledFor: m.scheduledFor?.toISOString() ?? null,
      happenedAt: m.happenedAt?.toISOString() ?? null,
      place: m.place,
    })),
    reflections: (journey?.reflections ?? []).map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

/** Creates the row on first write. A journey with nothing confirmed has no row. */
async function ensureJourney(userId: string, otherUserId: string): Promise<string> {
  const row = await prisma.rishtaJourney.upsert({
    where: { userId_otherUserId: { userId, otherUserId } },
    create: { userId, otherUserId },
    update: {},
    select: { id: true },
  });
  return row.id;
}

export type ConfirmStageResult =
  | { ok: true; summary: RishtaSummary }
  | { ok: false; error: "NOT_ALLOWED" | "NO_RISHTA"; message: string };

/**
 * Records a stage the user says they have reached.
 *
 * Two guards, and the first is the interesting one: a stage the derivation can
 * work out for itself is refused. Letting somebody "confirm" MUTUAL_MATCH would
 * store a claim that events already prove, and the moment stored and derived
 * disagree — an unmatch, a deleted interest — the stored one would win and lie.
 *
 * The second is ordinary: the target has to be one `nextStages` offers, so a
 * crafted request cannot jump a rishta from DISCOVERED to MET.
 */
export async function confirmRishtaStage(
  userId: string,
  otherUserId: string,
  stage: RishtaStage,
  closedReason?: string | null,
): Promise<ConfirmStageResult> {
  const summary = await getRishtaSummary(userId, otherUserId);
  if (!summary) {
    return { ok: false, error: "NO_RISHTA", message: "Is insaan ke saath abhi koi rishta shuru nahi hua." };
  }

  if (!requiresConfirmation(stage)) {
    return {
      ok: false,
      error: "NOT_ALLOWED",
      message: "Ye stage app khud pata kar leta hai — ise alag se set karne ki zarurat nahi.",
    };
  }
  if (!summary.nextStages.some((s) => s.stage === stage)) {
    return {
      ok: false,
      error: "NOT_ALLOWED",
      message: "Yahan se seedha is stage par nahi ja sakte.",
    };
  }

  const journeyId = await ensureJourney(userId, otherUserId);
  await prisma.rishtaJourney.update({
    where: { id: journeyId },
    data: {
      confirmedStage: stage,
      confirmedStageAt: new Date(),
      // Only meaningful with CLOSED, and cleared otherwise so a reopened rishta
      // does not carry a stale reason it no longer has.
      closedReason: stage === "CLOSED" ? (closedReason?.trim().slice(0, 300) || null) : null,
    },
  });

  return { ok: true, summary: (await getRishtaSummary(userId, otherUserId))! };
}

/**
 * Adds a topic, or marks one resolved.
 *
 * `label` is the identity — unique per journey — so seeding the same
 * compatibility dimension twice updates rather than duplicates. That matters
 * because seeding runs every time the Compatibility Lab is consulted.
 */
export async function upsertRishtaTopic(
  userId: string,
  otherUserId: string,
  input: { label: string; questionKey?: string | null; resolved?: boolean; outcome?: string | null },
): Promise<void> {
  const label = input.label.trim().slice(0, 120);
  if (!label) return;

  const journeyId = await ensureJourney(userId, otherUserId);
  const resolved = input.resolved ?? false;

  await prisma.rishtaTopic.upsert({
    where: { journeyId_label: { journeyId, label } },
    create: {
      journeyId,
      label,
      questionKey: input.questionKey ?? null,
      resolved,
      resolvedAt: resolved ? new Date() : null,
      outcome: input.outcome?.trim().slice(0, 300) ?? null,
    },
    // A seed must never un-resolve something the user already closed, so
    // `resolved` is only written when the caller actually passed it.
    update: {
      ...(input.resolved === undefined
        ? {}
        : { resolved, resolvedAt: resolved ? new Date() : null }),
      ...(input.outcome === undefined ? {} : { outcome: input.outcome?.trim().slice(0, 300) ?? null }),
    },
  });
}

/**
 * Turns the Compatibility Lab's `DISCUSS` dimensions into unresolved topics.
 *
 * The two layers answer neighbouring questions — "what does not line up" and
 * "what have you not talked about yet" — and letting each keep its own list
 * would guarantee they disagree the moment one is updated. Seeding means the
 * unresolved list starts as the honest one rather than empty until somebody
 * remembers to type it.
 *
 * Three properties make this safe to call on every candidate-scoped turn:
 *
 *  - `upsertRishtaTopic` keys on `label`, so re-seeding updates rather than
 *    duplicates.
 *  - It never passes `resolved`, so a topic the user already closed stays
 *    closed. A seed that could un-resolve something would punish the user for
 *    opening the profile again.
 *  - It writes nothing when there is nothing to discuss, so a well-aligned
 *    rishta never grows an empty journey row.
 *
 * Deliberately only `DISCUSS`. `UNKNOWN` dimensions are things nobody has
 * answered — a gap in the data, not a conversation the couple owes each other —
 * and seeding those would fill the list with questions the *app* should be
 * asking, drowning the handful that actually need two people to talk.
 */
export async function seedTopicsFromCompatibility(
  userId: string,
  otherUserId: string,
  discussDimensions: { key: string; label: string }[],
): Promise<void> {
  if (discussDimensions.length === 0) return;
  for (const d of discussDimensions) {
    await upsertRishtaTopic(userId, otherUserId, { label: d.label, questionKey: d.key });
  }
}

export async function addRishtaReflection(
  userId: string,
  otherUserId: string,
  body: string,
): Promise<void> {
  const text = body.trim().slice(0, 1000);
  if (!text) return;
  const journeyId = await ensureJourney(userId, otherUserId);
  await prisma.rishtaReflection.create({ data: { journeyId, body: text } });
}

export async function addRishtaMeeting(
  userId: string,
  otherUserId: string,
  input: { scheduledFor?: Date | null; happenedAt?: Date | null; place?: string | null; note?: string | null },
): Promise<void> {
  const journeyId = await ensureJourney(userId, otherUserId);
  await prisma.rishtaMeeting.create({
    data: {
      journeyId,
      scheduledFor: input.scheduledFor ?? null,
      happenedAt: input.happenedAt ?? null,
      place: input.place?.trim().slice(0, 120) ?? null,
      note: input.note?.trim().slice(0, 500) ?? null,
    },
  });
}

/* ------------------------------------------------------------------ */
/* The block Grio reads                                                */
/* ------------------------------------------------------------------ */

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "aaj";
  if (days === 1) return "kal";
  return `${days} din pehle`;
}

/**
 * The journey as prompt text.
 *
 * Every line is a count, a timestamp or a row the user created. Nothing is
 * summarised into a characterisation — there is no "conversation is going well"
 * here, because no row says that and the model would happily supply one.
 */
export function formatRishtaSummary(s: RishtaSummary): string {
  const lines: string[] = [];

  lines.push(
    `Abhi ka stage: ${s.stageLabel}` +
      (s.stageConfirmed ? " (user ne khud confirm kiya)" : " (app ne khud pata lagaya, user ne confirm nahi kiya)"),
  );
  if (s.closedReason) lines.push(`Band karne ki wajah, user ke apne shabdon me: "${s.closedReason}"`);

  const total = s.messagesFromUser + s.messagesFromOther;
  if (total === 0) {
    lines.push("Abhi tak ek bhi message nahi hua.");
  } else {
    lines.push(
      `Messages: kul ${total} (${s.messagesFromUser} user ke, ${s.messagesFromOther} unke)` +
        (s.lastInteractionAt ? `, aakhri baat ${daysAgo(s.lastInteractionAt)}` : ""),
    );
    if (s.awaitingReplyFrom === "user") lines.push("Aakhri message unka tha — jawab user ki taraf se baaki hai.");
    if (s.awaitingReplyFrom === "other") lines.push("Aakhri message user ka tha — ab unka jawab aana hai.");
  }

  if (s.questionsAsked > 0) {
    lines.push(`Sawaal: ${s.questionsAsked} poochhe gaye, ${s.questionsAnswered} ke jawab aa chuke hain.`);
  }
  if (s.familyInvolved) lines.push("Ghar walon ko is rishtey ke baare me pata hai.");

  if (s.unresolvedTopics.length > 0) {
    lines.push(
      `Ye baatein abhi tak sulajhi nahi:\n${s.unresolvedTopics.map((t) => `- ${t.label}`).join("\n")}`,
    );
  }
  if (s.resolvedTopics.length > 0) {
    lines.push(
      `Ye baatein ho chuki hain:\n${s.resolvedTopics
        .map((t) => `- ${t.label}${t.outcome ? ` — ${t.outcome}` : ""}`)
        .join("\n")}`,
    );
  }

  const upcoming = s.meetings.filter((m) => !m.happenedAt && m.scheduledFor);
  const past = s.meetings.filter((m) => m.happenedAt);
  if (upcoming.length > 0) {
    lines.push(`Milne ka plan hai: ${upcoming.map((m) => m.place ?? "jagah tay nahi").join(", ")}.`);
  }
  if (past.length > 0) lines.push(`${past.length} baar mil chuke hain.`);

  if (s.reflections.length > 0) {
    lines.push(
      `User ne khud ye note likhe the (unke apne shabd):\n${s.reflections
        .map((r) => `- "${r.body}" (${daysAgo(r.createdAt)})`)
        .join("\n")}`,
    );
  }

  return `${s.name.toUpperCase()} KE SAATH AB TAK KYA HUA (ye sab asli rows se aaya hai, kisi ne likha nahi):
${lines.join("\n")}

Is hisse ke sakht niyam:
- Upar jo likha hai bas wahi hua hai. Isse aage koi baat, koi message, koi mulaqat apne se mat jodiye — user aksar ye isliye poochhta hai kyunki use khud yaad nahi, aur wahi ek jagah hai jahan wo aapko pakad nahi sakta.
- "Baat achhi chal rahi hai", "inhe aap pasand hain" — aisa koi nateeja mat nikaliye. Upar sirf ginti aur tareekhein hain, raay nahi.
- Stage agar "app ne khud pata lagaya" likha hai, to use waisa hi boliye. User ne kuch confirm nahi kiya hai.
- Jo baat "sulajhi nahi" list me hai, wo sabse kaam ki hai. Agla kadam poochha jaye to wahin se sujhaiye.`;
}
