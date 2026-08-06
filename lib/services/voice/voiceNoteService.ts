import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ageFromDate } from "@/lib/services/match/age";
import { sendInterest } from "@/lib/services/match/sendInterest";
import { isBlockedEitherWay } from "@/lib/services/safety/blockService";
import { createNotice } from "@/lib/services/notice/noticeService";
import { recordQuestEvent } from "@/lib/services/quests/questService";
import { consumeReward } from "@/lib/services/rewards/rewardService";
import { celebrateFirst, type Celebration } from "@/lib/services/rewards/celebrationService";
import { getPlanContext, isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { mediaStorage } from "@/lib/services/storage/mediaStorage";
import type { ReceivedVoiceNoteView } from "@/lib/contracts/voice";
import type { VoiceNoteContext } from "@prisma/client";

/**
 * Sending and opening a voice note.
 *
 * ## Why sending is not its own paid quota
 *
 * A voice note *is* an Interest — it goes to one person, it says "I want to
 * talk to you", and the receiver can act on it. So it costs an Interest from
 * `interestsPerMonth` and goes through the same `sendInterest` path, mutual
 * detection and all. Inventing a second budget would mean two numbers that can
 * disagree about how many strangers one person may contact this month, and the
 * anti-spam property would then be whichever number someone forgot to check.
 *
 * Free users can therefore send. That is the point: a free user's note is what
 * lands in a *second* user's inbox as a locked teaser. The paid capability is
 * `voiceUnlock` — opening one you received.
 *
 * ## Delivery is gated on moderation, not on sending
 *
 * A PENDING clip (screening was unavailable, see contentModeration) still
 * sends and still costs the sender their Interest — the act was real. What it
 * does not do is generate a Notice, so the receiver is not told about audio
 * nobody has checked. `/admin/moderation` approves it, which delivers it.
 */

export type SendVoiceNoteResult =
  | {
      ok: true;
      voiceNoteId: string;
      matched: boolean;
      matchId: string | null;
      /** True when the clip is awaiting review and has not been delivered yet. */
      heldForReview: boolean;
      celebration: Celebration | null;
    }
  | { ok: false; code: SendVoiceNoteError; message: string };

export type SendVoiceNoteError =
  | "FEATURE_OFF"
  | "BLOCKED"
  | "NOT_FOUND"
  | "ALREADY_SENT"
  | "REJECTED"
  | "LIMIT_REACHED";

/**
 * The line a receiver sees before unlocking.
 *
 * Everything here is a coarse bucket that thousands of people share — city,
 * age, job title. No name, no photo, no id. The masking is done *here*, in
 * what gets written, not by a flag the UI is trusted to honour: the notice row
 * itself has to be safe to hand to the client, because it is.
 */
export function buildMaskedTeaser(sender: {
  currentCity: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  jobTitle: string | null;
}): string {
  const age = ageFromDate(sender.dateOfBirth);
  // "27 saal ki Software Engineer" vs "27 saal ke Software Engineer".
  const suffix = sender.gender === "Ladki" ? "ki" : sender.gender === "Ladka" ? "ke" : null;

  const parts: string[] = [];
  if (sender.currentCity) parts.push(`${sender.currentCity} se`);
  if (age !== null) parts.push(suffix ? `${age} saal ${suffix}` : `${age} saal`);
  if (sender.jobTitle) parts.push(sender.jobTitle);

  return parts.length > 0 ? parts.join(" ") : "Kisi";
}

/**
 * Writes the "you have a voice note" notice and delivers it.
 *
 * Split out because delivery happens at two different times: immediately when
 * screening cleared at upload, or later when an admin approves a held clip.
 * Both paths must produce the identical notice — two copies of this logic
 * would eventually drift into two different privacy promises.
 *
 * Exported (not just used internally) because Ask Bridge's answer flow
 * creates a VoiceNote directly with prisma rather than through `sendVoiceNote`
 * — it does not go through `sendInterest`, since answering a question a
 * stranger asked *you* is not itself an act of contacting them, and must not
 * cost the answerer an Interest — but the recipient still needs the same
 * delivery-on-approve notice plumbing either way.
 *
 * ## Why QUESTION_ANSWER gets its own, unmasked branch
 *
 * Every other context masks the sender because the recipient never chose this
 * contact — that is the entire reason the teaser hides identity. A
 * QUESTION_ANSWER voice note runs the other direction: the recipient here is
 * the original *asker*, who deliberately picked this exact person's profile
 * to ask in the first place. There is nothing to mask; pretending otherwise
 * would just be confusing, not private.
 */
export async function notifyRecipient(voiceNoteId: string): Promise<void> {
  const note = await prisma.voiceNote.findUnique({
    where: { id: voiceNoteId },
    include: {
      mediaAsset: { select: { durationMs: true } },
      fromUser: {
        select: {
          profile: {
            select: {
              displayName: true,
              currentCity: true,
              dateOfBirth: true,
              gender: true,
              profession: { select: { jobTitle: true } },
            },
          },
        },
      },
    },
  });
  if (!note?.toUserId) return;

  if (note.context === "QUESTION_ANSWER" && note.relatedQuestionId) {
    await createNotice({
      userId: note.toUserId,
      kind: "QUESTION_ANSWERED",
      title: "Aapke sawaal ka jawab aa gaya",
      body: `${note.fromUser.profile?.displayName ?? "Unhone"} ne aapke sawaal ka voice jawab diya hai.`,
      href: "/user/inbox",
      actorMasked: false,
      relatedId: note.relatedQuestionId,
    });
    return;
  }

  const p = note.fromUser.profile;
  const who = buildMaskedTeaser({
    currentCity: p?.currentCity ?? null,
    dateOfBirth: p?.dateOfBirth ?? null,
    gender: p?.gender ?? null,
    jobTitle: p?.profession?.jobTitle ?? null,
  });
  const seconds = Math.max(1, Math.round((note.mediaAsset.durationMs ?? 0) / 1000));

  await createNotice({
    userId: note.toUserId,
    kind: "VOICE_NOTE_RECEIVED",
    title: "Kisi ne aapko voice note bheji hai",
    body: `${who} ne aapki profile dekh kar ${seconds} second ki baat record ki.`,
    href: "/user/inbox",
    actorMasked: true,
    relatedId: note.id,
  });
}

/**
 * Admin clears a held clip. Approving is also what *delivers* it — the note
 * row has existed since the send, but the recipient was never told.
 */
export async function moderateHeldVoiceNote(params: {
  mediaAssetId: string;
  approve: boolean;
  reason?: string | null;
}): Promise<{ ok: boolean; delivered: boolean }> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: params.mediaAssetId },
    include: { voiceNote: { select: { id: true } } },
  });
  if (!asset) return { ok: false, delivered: false };

  await prisma.mediaAsset.update({
    where: { id: params.mediaAssetId },
    data: {
      moderation: params.approve ? "APPROVED" : "REJECTED",
      moderationReason: params.reason ?? null,
      ...(params.approve ? {} : { deletedAt: new Date() }),
    },
  });

  if (!params.approve) {
    // The row stays for the audit trail; the bytes do not. An admin has just
    // decided nobody may hear this, and keeping the file after that decision
    // means the only thing standing between it and a listener is a boolean.
    // The upload path does the same on an auto-reject.
    await mediaStorage.remove(asset.storageKey);
  }

  if (params.approve && asset.voiceNote) {
    await notifyRecipient(asset.voiceNote.id);
    return { ok: true, delivered: true };
  }
  return { ok: true, delivered: false };
}

export interface PendingMediaRow {
  mediaId: string;
  ownerName: string;
  transcript: string | null;
  seconds: number;
  moderationReason: string | null;
  hasRecipient: boolean;
  createdAt: Date;
}

/** The held queue — clips screening could not clear on its own. */
export async function getPendingMedia(limit = 50): Promise<PendingMediaRow[]> {
  const rows = await prisma.mediaAsset.findMany({
    where: { moderation: "PENDING", deletedAt: null, kind: "VOICE_NOTE" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      owner: { select: { fullName: true } },
      voiceNote: { select: { id: true } },
    },
  });
  return rows.map((r) => ({
    mediaId: r.id,
    ownerName: r.owner.fullName,
    transcript: r.transcript,
    seconds: Math.max(1, Math.round((r.durationMs ?? 0) / 1000)),
    moderationReason: r.moderationReason,
    hasRecipient: r.voiceNote !== null,
    createdAt: r.createdAt,
  }));
}

export async function sendVoiceNote(params: {
  fromUserId: string;
  toUserId: string;
  mediaAssetId: string;
  context?: VoiceNoteContext;
}): Promise<SendVoiceNoteResult> {
  const { fromUserId, toUserId, mediaAssetId } = params;
  const context = params.context ?? "REEL_INTEREST";

  const gate = await isFeatureAvailable(fromUserId, "voiceNotes");
  if (!gate.allowed) {
    return { ok: false, code: "FEATURE_OFF", message: "Voice note abhi available nahi hai." };
  }

  if (fromUserId === toUserId) {
    return { ok: false, code: "NOT_FOUND", message: "Khud ko voice note nahi bhej sakte." };
  }

  if (await isBlockedEitherWay(fromUserId, toUserId)) {
    // Deliberately the same wording a missing user would get. Confirming a
    // block exists tells the sender something the blocker chose not to say.
    return { ok: false, code: "NOT_FOUND", message: "Ye profile abhi available nahi hai." };
  }

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: mediaAssetId, ownerUserId: fromUserId, kind: "VOICE_NOTE", deletedAt: null },
    include: { voiceNote: { select: { id: true } } },
  });
  if (!asset) {
    return { ok: false, code: "NOT_FOUND", message: "Recording nahi mili — dobara record kijiye." };
  }
  if (asset.moderation === "REJECTED") {
    return { ok: false, code: "REJECTED", message: asset.moderationReason ?? "Ye recording bheji nahi ja sakti." };
  }
  if (asset.voiceNote) {
    return { ok: false, code: "ALREADY_SENT", message: "Ye recording pehle hi bheji ja chuki hai." };
  }

  const existing = await prisma.voiceNote.findFirst({
    where: { fromUserId, toUserId, context },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, code: "ALREADY_SENT", message: "Aap inhe pehle hi ek voice note bhej chuke hain." };
  }

  // The Interest is the cost and the consent record. If the month's quota is
  // out, nothing else happens — no VoiceNote row, no notice, no quest credit.
  const interest = await sendInterest(fromUserId, toUserId);
  if (!interest.ok) {
    return { ok: false, code: "LIMIT_REACHED", message: interest.message };
  }

  const note = await prisma.voiceNote.create({
    data: { mediaAssetId, fromUserId, toUserId, context },
  });

  const delivered = asset.moderation === "APPROVED";
  if (delivered) await notifyRecipient(note.id);

  // Quests and the lifetime-first are both bonuses on top of a send that has
  // already happened — neither may fail it.
  const [firstCelebration, questOutcome] = await Promise.all([
    celebrateFirst(fromUserId, "first_voice_note_sent"),
    recordQuestEvent(fromUserId, "first_voice_note"),
  ]);
  await Promise.all([
    recordQuestEvent(fromUserId, "daily_voice_note"),
    recordQuestEvent(fromUserId, "boost_voice_notes"),
  ]);

  return {
    ok: true,
    voiceNoteId: note.id,
    matched: interest.matched,
    matchId: interest.matchId,
    heldForReview: !delivered,
    // The lifetime-first wins when both land on the same action: it is the
    // rarer moment, and the quest reward is already in the inbox either way.
    celebration: firstCelebration ?? questOutcome?.celebration ?? null,
  };
}

export type UnlockResult =
  | { ok: true; playbackUrl: string; usedCredit: boolean; celebration: Celebration | null }
  | { ok: false; code: "NOT_FOUND" | "LOCKED"; message: string };

/**
 * Opens a received note.
 *
 * Two ways in: the plan says yes (`voiceUnlock`), or the user spends a
 * VOICE_UNLOCK credit they earned. The credit is consumed *before* the row is
 * updated so a failure can never leave someone charged for a note that stayed
 * shut; the reverse order could.
 */
export async function unlockVoiceNote(userId: string, voiceNoteId: string): Promise<UnlockResult> {
  const note = await prisma.voiceNote.findFirst({
    where: { id: voiceNoteId, toUserId: userId },
    include: { mediaAsset: { select: { id: true, moderation: true, deletedAt: true } } },
  });

  if (!note || note.mediaAsset.deletedAt || note.mediaAsset.moderation !== "APPROVED") {
    return { ok: false, code: "NOT_FOUND", message: "Ye voice note available nahi hai." };
  }

  if (note.unlockedAt) {
    return {
      ok: true,
      playbackUrl: `/api/media/${note.mediaAsset.id}`,
      usedCredit: false,
      celebration: null,
    };
  }

  const ctx = await getPlanContext(userId);
  let usedCredit = false;

  if (!ctx.features.voiceUnlock) {
    const spent = await consumeReward(userId, "VOICE_UNLOCK", 1);
    if (!spent) {
      return {
        ok: false,
        code: "LOCKED",
        message: "Voice note kholne ke liye plan upgrade karein, ya mission poora karke ek unlock jeetein.",
      };
    }
    usedCredit = true;
  }

  await prisma.voiceNote.update({
    where: { id: voiceNoteId },
    data: { unlockedAt: new Date() },
  });

  return {
    ok: true,
    playbackUrl: `/api/media/${note.mediaAsset.id}`,
    usedCredit,
    celebration: await celebrateFirst(userId, "first_voice_note_received"),
  };
}

export type { ReceivedVoiceNoteView } from "@/lib/contracts/voice";

export interface RecentVoiceNoteSignal {
  id: string;
  /** QUESTION_ANSWER reads as "your question got answered", not a masked teaser. */
  isAnswer: boolean;
  teaser: string;
  createdAt: Date;
}

/**
 * Narrow, dashboard-banner-sized slice of the inbox — unplayed only, so a
 * clip the recipient already listened to never lingers on the banner as if
 * it were still new. Mirrors admirerService's `getRecentInterestFaces`: a
 * purpose-built recent-and-unactioned query, separate from the full inbox
 * list `getReceivedVoiceNotes` returns.
 */
export async function getRecentUnplayedVoiceNotes(userId: string, limit = 3): Promise<RecentVoiceNoteSignal[]> {
  const notes = await prisma.voiceNote.findMany({
    where: {
      toUserId: userId,
      playedAt: null,
      mediaAsset: { moderation: "APPROVED", deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      fromUser: {
        select: {
          profile: {
            select: { currentCity: true, dateOfBirth: true, gender: true, profession: { select: { jobTitle: true } } },
          },
        },
      },
    },
  });

  return notes.map((n) => {
    const p = n.fromUser.profile;
    return {
      id: n.id,
      isAnswer: n.context === "QUESTION_ANSWER",
      teaser: buildMaskedTeaser({
        currentCity: p?.currentCity ?? null,
        dateOfBirth: p?.dateOfBirth ?? null,
        gender: p?.gender ?? null,
        jobTitle: p?.profession?.jobTitle ?? null,
      }),
      createdAt: n.createdAt,
    };
  });
}

export interface LockedVoiceNoteSignal {
  id: string;
  isAnswer: boolean;
  teaser: string;
  seconds: number;
  createdAt: Date;
}

/**
 * Still-shut notes, newest first — the Grio Deck's slice.
 *
 * A third purpose-built query rather than a filter over `getReceivedVoiceNotes`,
 * for the same reason `getRecentUnplayedVoiceNotes` is one: the three callers
 * want three different unactioned-ness. The inbox wants everything ever
 * received; the dashboard banner wants what hasn't been *heard*; the deck wants
 * what hasn't been *opened*. Collapsing them would mean one query carrying a
 * flag that decides which product promise it is keeping.
 *
 * QUESTION_ANSWER notes are included. They are locked like any other clip —
 * the audio is what the gate protects — but their teaser is the answer line
 * and the caller must not render them as "kisi ne bheji"; `isAnswer` is that
 * signal, same as in `RecentVoiceNoteSignal`.
 */
export async function getLockedVoiceNotes(userId: string, limit = 3): Promise<LockedVoiceNoteSignal[]> {
  const notes = await prisma.voiceNote.findMany({
    where: {
      toUserId: userId,
      unlockedAt: null,
      mediaAsset: { moderation: "APPROVED", deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      mediaAsset: { select: { durationMs: true } },
      fromUser: {
        select: {
          profile: {
            select: { currentCity: true, dateOfBirth: true, gender: true, profession: { select: { jobTitle: true } } },
          },
        },
      },
    },
  });

  return notes.map((n) => {
    const p = n.fromUser.profile;
    const isAnswer = n.context === "QUESTION_ANSWER";
    return {
      id: n.id,
      isAnswer,
      teaser: isAnswer
        ? "Aapke sawaal ka jawab"
        : buildMaskedTeaser({
            currentCity: p?.currentCity ?? null,
            dateOfBirth: p?.dateOfBirth ?? null,
            gender: p?.gender ?? null,
            jobTitle: p?.profession?.jobTitle ?? null,
          }),
      seconds: Math.max(1, Math.round((n.mediaAsset.durationMs ?? 0) / 1000)),
      createdAt: n.createdAt,
    };
  });
}

/**
 * Marks a note as actually heard.
 *
 * `playedAt` has existed since the first voice-note migration and until now
 * **nothing ever wrote it** — `getRecentUnplayedVoiceNotes` filtered on a
 * column that was permanently null, so the dashboard banner announced every
 * received clip forever, including ones the user had already unlocked and
 * listened to. Unlocking is not the same event: a user can open a note and
 * never press play, and the banner's promise is "you haven't heard this yet".
 * So the write happens on first playback, from the player, and only for a note
 * this user actually received.
 *
 * Idempotent by construction: `playedAt: null` in the filter means a second
 * ping is a no-op rather than a moved timestamp.
 */
export async function markVoiceNotePlayed(userId: string, voiceNoteId: string): Promise<boolean> {
  const result = await prisma.voiceNote.updateMany({
    where: { id: voiceNoteId, toUserId: userId, unlockedAt: { not: null }, playedAt: null },
    data: { playedAt: new Date() },
  });
  return result.count > 0;
}

export async function getReceivedVoiceNotes(userId: string): Promise<ReceivedVoiceNoteView[]> {
  const notes = await prisma.voiceNote.findMany({
    where: {
      toUserId: userId,
      mediaAsset: { moderation: "APPROVED", deletedAt: null },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      mediaAsset: { select: { id: true, durationMs: true } },
      fromUser: {
        select: {
          id: true,
          profile: {
            select: {
              id: true,
              displayName: true,
              currentCity: true,
              dateOfBirth: true,
              gender: true,
              profession: { select: { jobTitle: true } },
            },
          },
        },
      },
    },
  });

  return notes.map((n) => {
    const p = n.fromUser.profile;
    const unlocked = n.unlockedAt !== null;
    // See notifyRecipient: for a question's answer, this recipient is the
    // original asker and always already knows who they asked. Only the clip
    // itself stays behind the same unlock gate every other voice note uses.
    const identityKnown = n.context === "QUESTION_ANSWER" || unlocked;
    return {
      id: n.id,
      context: n.context,
      teaser:
        n.context === "QUESTION_ANSWER"
          ? "Aapke sawaal ka jawab"
          : buildMaskedTeaser({
              currentCity: p?.currentCity ?? null,
              dateOfBirth: p?.dateOfBirth ?? null,
              gender: p?.gender ?? null,
              jobTitle: p?.profession?.jobTitle ?? null,
            }),
      seconds: Math.max(1, Math.round((n.mediaAsset.durationMs ?? 0) / 1000)),
      unlocked,
      playbackUrl: unlocked ? `/api/media/${n.mediaAsset.id}` : null,
      senderName: identityKnown ? (p?.displayName ?? null) : null,
      senderProfileId: identityKnown ? (p?.id ?? null) : null,
      senderUserId: identityKnown ? n.fromUser.id : null,
      createdAt: n.createdAt.toISOString(),
    };
  });
}
