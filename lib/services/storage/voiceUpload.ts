import "server-only";
import { prisma } from "@/lib/db/prisma";
import { mediaStorage } from "@/lib/services/storage/mediaStorage";
import { moderateOutgoingText, screenDeterministic } from "@/lib/services/moderation/contentModeration";
import { transcribeAudio } from "@/lib/speech/serverTranscribe";
import {
  CHAT_VOICE_MAX_BYTES,
  CHAT_VOICE_MAX_MS,
  CHAT_VOICE_MAX_SECONDS,
  VOICE_MAX_BYTES,
  VOICE_MAX_MS,
  VOICE_MAX_SECONDS,
} from "@/lib/constants/voice";

/**
 * The upload+moderate half of a voice clip, shared by every recorder that
 * ultimately produces a `MediaAsset(kind=VOICE_NOTE)` — originally just
 * `/api/media/voice`, now also the family portal's Parent Blessing recorder
 * (Phase E). What differs between callers is *whose* account the clip is
 * filed under and what happens to it after upload (sent as an Interest,
 * attached to the owner's own profile); this is only the part both share.
 *
 * ## Whose transcript moderation reads
 *
 * The server's own. Until 2026-09-23 the screen read a transcript the
 * *browser* posted next to the file, which meant a clip that said a phone
 * number out loud cleared moderation as long as the form field said
 * "namaste" — the one person able to forge that field is the one person the
 * screen exists to stop. Now the stored bytes are transcribed here and that
 * text is what `moderateOutgoingText` sees. The browser's text is still run
 * through the deterministic pass (a number it caught is a number), but it can
 * only ever make a verdict stricter, never clear one.
 *
 * Cost was the original reason not to: roughly a paisa per 10-second clip on
 * either vendor, paid on recordings that are never sent too. That is cheap
 * next to a stranger's number leaving the platform.
 *
 * If the server cannot transcribe (no vendor key, vendor down) the clip is
 * PENDING — held for the admin queue, never delivered on the browser's word.
 *
 * ## `purpose: "chat"`
 *
 * A voice message inside an open chat is not screened at all, by the same
 * decision that leaves typed chat messages unscreened (2026-09-23): both people
 * said yes, somebody paid to open the conversation, and a number typed there is
 * already allowed. What *is* enforced for chat is who may hear it — see the
 * `message` branch in `mediaAccess.ts`.
 */

const ALLOWED_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
};

function normaliseMime(raw: string): string {
  return raw.split(";")[0]!.trim().toLowerCase();
}

export type VoiceUploadResult =
  | {
      ok: true;
      mediaId: string;
      durationMs: number;
      moderation: "APPROVED" | "PENDING";
      playbackUrl: string;
    }
  | { ok: false; status: number; error: string; message: string };

export async function uploadAndModerateVoiceClip(params: {
  ownerUserId: string;
  form: FormData;
  logFeature: string;
  /** "stranger" (default): 10s + screened. "chat": 60s, not screened — see header. */
  purpose?: "stranger" | "chat";
}): Promise<VoiceUploadResult> {
  const { ownerUserId, form, logFeature } = params;
  const forChat = params.purpose === "chat";
  const maxBytes = forChat ? CHAT_VOICE_MAX_BYTES : VOICE_MAX_BYTES;
  const maxMs = forChat ? CHAT_VOICE_MAX_MS : VOICE_MAX_MS;
  const maxSeconds = forChat ? CHAT_VOICE_MAX_SECONDS : VOICE_MAX_SECONDS;

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return { ok: false, status: 400, error: "BAD_REQUEST", message: "Audio file nahi mili." };
  }

  const extension = ALLOWED_TYPES[file.type] ?? ALLOWED_TYPES[normaliseMime(file.type)];
  if (!extension) {
    return { ok: false, status: 422, error: "VALIDATION_FAILED", message: "Ye audio format supported nahi hai." };
  }
  if (file.size === 0) {
    return { ok: false, status: 422, error: "VALIDATION_FAILED", message: "Recording khaali hai." };
  }
  if (file.size > maxBytes) {
    return { ok: false, status: 422, error: "VALIDATION_FAILED", message: "Recording bahut badi hai." };
  }

  const durationMs = Number(form.get("durationMs") ?? 0);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, status: 422, error: "VALIDATION_FAILED", message: "Recording ki length nahi mili." };
  }
  if (durationMs > maxMs) {
    return {
      ok: false,
      status: 422,
      error: "VALIDATION_FAILED",
      message: `Voice note ${maxSeconds} second se lambi nahi ho sakti.`,
    };
  }

  const transcriptRaw = form.get("transcript");
  const browserTranscript =
    typeof transcriptRaw === "string" ? transcriptRaw.slice(0, 2000).trim() || null : null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await mediaStorage.upload({ userId: ownerUserId, kind: "VOICE_NOTE", buffer, extension });

  const asset = await prisma.mediaAsset.create({
    data: {
      ownerUserId,
      kind: "VOICE_NOTE",
      storageKey: stored.storageKey,
      mimeType: normaliseMime(file.type),
      durationMs: Math.round(durationMs),
      sizeBytes: stored.sizeBytes,
      transcript: forChat ? null : browserTranscript,
      moderation: forChat ? "APPROVED" : "PENDING",
    },
  });

  if (forChat) {
    return {
      ok: true,
      mediaId: asset.id,
      durationMs: asset.durationMs ?? Math.round(durationMs),
      moderation: "APPROVED",
      playbackUrl: `/api/media/${asset.id}`,
    };
  }

  const serverTranscript = await transcribeAudio({ audio: buffer, mimeType: normaliseMime(file.type) });
  const browserPass = browserTranscript ? screenDeterministic(browserTranscript) : null;

  const verdict = browserPass?.blocked
    ? { decision: "REJECTED" as const, reason: browserPass.reason }
    : serverTranscript === null
      ? {
          decision: "PENDING" as const,
          reason: "Server par transcript nahi ban paya — bina sune deliver nahi karte, admin review me hai.",
        }
      : await moderateOutgoingText({ text: serverTranscript, userId: ownerUserId, logFeature });

  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: {
      moderation: verdict.decision,
      moderationReason: verdict.reason,
      // The admin queue shows this field, so it carries the text the verdict
      // was made on — the server's whenever there is one.
      ...(serverTranscript !== null ? { transcript: serverTranscript || null } : {}),
    },
  });

  if (verdict.decision === "REJECTED") {
    await mediaStorage.remove(stored.storageKey);
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } });
    return { ok: false, status: 422, error: "REJECTED", message: verdict.reason ?? "Ye recording bheji nahi ja sakti." };
  }

  return {
    ok: true,
    mediaId: asset.id,
    durationMs: asset.durationMs ?? Math.round(durationMs),
    moderation: verdict.decision,
    playbackUrl: `/api/media/${asset.id}`,
  };
}
