import "server-only";
import { prisma } from "@/lib/db/prisma";
import { mediaStorage } from "@/lib/services/storage/mediaStorage";
import { moderateOutgoingText } from "@/lib/services/moderation/contentModeration";
import { VOICE_MAX_BYTES, VOICE_MAX_MS, VOICE_MAX_SECONDS } from "@/lib/constants/voice";

/**
 * The upload+moderate half of a voice clip, shared by every recorder that
 * ultimately produces a `MediaAsset(kind=VOICE_NOTE)` — originally just
 * `/api/media/voice`, now also the family portal's Parent Blessing recorder
 * (Phase E). What differs between callers is *whose* account the clip is
 * filed under and what happens to it after upload (sent as an Interest,
 * attached to the owner's own profile); this is only the part both share.
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
}): Promise<VoiceUploadResult> {
  const { ownerUserId, form, logFeature } = params;

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
  if (file.size > VOICE_MAX_BYTES) {
    return { ok: false, status: 422, error: "VALIDATION_FAILED", message: "Recording bahut badi hai." };
  }

  const durationMs = Number(form.get("durationMs") ?? 0);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, status: 422, error: "VALIDATION_FAILED", message: "Recording ki length nahi mili." };
  }
  if (durationMs > VOICE_MAX_MS) {
    return {
      ok: false,
      status: 422,
      error: "VALIDATION_FAILED",
      message: `Voice note ${VOICE_MAX_SECONDS} second se lambi nahi ho sakti.`,
    };
  }

  const transcriptRaw = form.get("transcript");
  const transcript = typeof transcriptRaw === "string" ? transcriptRaw.slice(0, 2000).trim() || null : null;

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
      transcript,
      moderation: "PENDING",
    },
  });

  const verdict = await moderateOutgoingText({ text: transcript, userId: ownerUserId, logFeature });

  await prisma.mediaAsset.update({
    where: { id: asset.id },
    data: { moderation: verdict.decision, moderationReason: verdict.reason },
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
