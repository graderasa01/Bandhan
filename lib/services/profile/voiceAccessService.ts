import { prisma } from "@/lib/db/prisma";
import type { VoiceSelfFillStatus } from "@prisma/client";
import { VOICE_REASON_MAX, VOICE_REASON_MIN } from "@/lib/profile/voiceAccessConstants";
import { noopT, type Translate } from "@/lib/i18n/translate";

export { VOICE_REASON_MAX, VOICE_REASON_MIN };

export type VoiceAccessResult =
  | { ok: true; status: VoiceSelfFillStatus }
  | { ok: false; error: "NOT_FOUND" | "INVALID_STATE"; message: string; status: number };

/**
 * A user asking for voice access to fill their *own* profile — the
 * exception path, since voice defaults to parent-for-child only (see
 * VoiceSelfFillStatus on the User model). Re-requesting after a REJECTED
 * decision is allowed — someone's situation can change — but a PENDING or
 * already-APPROVED request can't be resubmitted, since either resubmitting
 * would just restart a review already in flight or paper over a decision
 * that already went their way.
 */
export async function requestVoiceSelfFill(
  userId: string,
  reason: string,
  t: Translate = noopT,
): Promise<VoiceAccessResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { voiceSelfFillStatus: true } });
  if (!user) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.voiceAccess.userNotFound", "User nahi mila."), status: 404 };
  }

  if (user.voiceSelfFillStatus === "PENDING") {
    return {
      ok: false,
      error: "INVALID_STATE",
      message: t("profileServices.voiceAccess.alreadyPending", "Aapki request pehle se review ke liye pending hai."),
      status: 409,
    };
  }
  if (user.voiceSelfFillStatus === "APPROVED") {
    return {
      ok: false,
      error: "INVALID_STATE",
      message: t("profileServices.voiceAccess.alreadyApproved", "Aapko pehle se hi access mil chuka hai."),
      status: 409,
    };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      voiceSelfFillStatus: "PENDING",
      voiceSelfFillReason: reason,
      voiceSelfFillReviewedAt: null,
      voiceSelfFillReviewedBy: null,
      voiceSelfFillReviewNote: null,
    },
    select: { voiceSelfFillStatus: true },
  });

  return { ok: true, status: updated.voiceSelfFillStatus };
}

export async function decideVoiceSelfFill(
  params: {
    userId: string;
    action: "approve" | "reject";
    adminId: string;
    note?: string;
  },
  t: Translate = noopT,
): Promise<VoiceAccessResult> {
  const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { voiceSelfFillStatus: true } });
  if (!user) {
    return { ok: false, error: "NOT_FOUND", message: t("profileServices.voiceAccess.userNotFound", "User nahi mila."), status: 404 };
  }
  if (user.voiceSelfFillStatus !== "PENDING") {
    return {
      ok: false,
      error: "INVALID_STATE",
      message: t("profileServices.voiceAccess.notPending", "Ye request ab pending nahi hai."),
      status: 409,
    };
  }

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: {
      voiceSelfFillStatus: params.action === "approve" ? "APPROVED" : "REJECTED",
      voiceSelfFillReviewedAt: new Date(),
      voiceSelfFillReviewedBy: params.adminId,
      voiceSelfFillReviewNote: params.note ?? null,
    },
    select: { voiceSelfFillStatus: true },
  });

  return { ok: true, status: updated.voiceSelfFillStatus };
}
