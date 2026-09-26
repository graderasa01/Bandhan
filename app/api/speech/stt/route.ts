import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/requireUser";
import { checkSpeechRate } from "@/lib/speech/speechRateLimit";
import { resolveVoiceRoute } from "@/lib/speech/voiceConfig";
import { transcribeAudio } from "@/lib/speech/serverTranscribe";

export const runtime = "nodejs";

/** Upload types passed through to the vendor as declared — see the note at the read below. */
const STT_UPLOAD_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave", "audio/aac", "audio/mp4", "audio/m4a", "audio/x-m4a"]);

/**
 * One transcript endpoint, two vendors behind it.
 *
 * The client (`SarvamSpeechProvider`) is not told which one answered and must
 * never learn: it uploads a WAV and reads back a transcript, exactly as before
 * Gemini existed. Everything vendor-shaped — which key, which model, which
 * voice — is resolved in `transcribeAudio` from the admin's setting.
 */
export async function POST(req: Request) {
  // Signed in, always. This endpoint spends vendor money per second of audio
  // and had no auth at all: anybody who knew the path could transcribe their
  // own files on this deployment's key.
  const { user, response } = await requireUser();
  if (!user) return response;

  const rate = checkSpeechRate(user.id, "stt");
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, message: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }

  const route = await resolveVoiceRoute("stt");
  if (!route) {
    return NextResponse.json({ ok: false, message: "not_configured" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "bad_request" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ ok: false, message: "bad_request" }, { status: 400 });
  }
  const localeField = form.get("locale");
  const locale = typeof localeField === "string" && localeField ? localeField : "hi-IN";

  // The web app's `toWav16kMono` always sends WAV, whatever the browser's
  // MediaRecorder produced. The native app cannot: Android's recorder has no
  // WAV output, so it sends AAC, and says so on the part. Only a short list of
  // formats both vendors read is believed; anything else (or nothing) is taken
  // as the WAV it has always been.
  const declared = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const mimeType = STT_UPLOAD_TYPES.has(declared) ? declared : "audio/wav";

  const transcript = await transcribeAudio({
    route,
    audio: await file.arrayBuffer(),
    mimeType,
    locale,
  });
  if (transcript === null) {
    return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
  }
  // Neither vendor's language detection is used by the caller beyond display,
  // so the request's own locale is echoed.
  return NextResponse.json({ ok: true, transcript, languageCode: locale });
}
