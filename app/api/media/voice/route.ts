import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { isFeatureAvailable } from "@/lib/services/plans/entitlements";
import { uploadAndModerateVoiceClip } from "@/lib/services/storage/voiceUpload";

export const runtime = "nodejs";

/**
 * Records a clip. Deliberately does NOT send it anywhere.
 *
 * Upload and send are two steps because they fail differently: a recording can
 * be re-listened to and discarded, while a send costs an Interest from the
 * monthly quota and cannot be taken back. Fusing them would mean either
 * charging for abandoned recordings or letting an unscreened clip through
 * while the user is still deciding.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const gate = await isFeatureAvailable(user.id, "voiceNotes");
  if (!gate.allowed) {
    return NextResponse.json(
      { error: "FEATURE_OFF", message: "Voice note abhi available nahi hai." },
      { status: 403 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "BAD_REQUEST", message: "Audio file nahi mili." }, { status: 400 });
  }

  const result = await uploadAndModerateVoiceClip({
    ownerUserId: user.id,
    form,
    logFeature: "voice_note_moderation",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  console.info(`[media:voice] user=${user.id} asset=${result.mediaId} ${result.moderation}`);

  return NextResponse.json(
    {
      mediaId: result.mediaId,
      durationMs: result.durationMs,
      moderation: result.moderation,
      /** PENDING clips can be sent — they just won't be delivered until cleared. */
      pendingReview: result.moderation === "PENDING",
      playbackUrl: result.playbackUrl,
    },
    { status: 201 },
  );
}
