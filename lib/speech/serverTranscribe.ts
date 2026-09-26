import "server-only";
import { toSarvamLanguageCode } from "@/lib/speech/sarvamLocale";
import { resolveVoiceRoute, type VoiceRoute } from "@/lib/speech/voiceConfig";
import { geminiTranscribe } from "@/lib/speech/geminiSpeech";
import { GEMINI_STT_MODEL } from "@/lib/speech/voiceCatalog";

/**
 * Audio in, transcript out — on the server, from bytes the server holds.
 *
 * Two callers with different trust needs share it. `/api/speech/stt` is a
 * convenience for the member's own composer: whatever it returns lands in a
 * text box they read before sending. `voiceUpload.ts` is the opposite — its
 * transcript is what moderation reads before a clip reaches a stranger, so it
 * must come from the stored audio and never from the browser that recorded it.
 * A client-supplied transcript is a claim about the audio, and the one person
 * with a reason to make that claim false is the person trying to slip a phone
 * number past the screen.
 *
 * `null` means "could not transcribe" (no vendor key, upstream error). An empty
 * string means the vendor heard nothing. Callers treat both as "unchecked",
 * never as "clean".
 */
export async function transcribeAudio(params: {
  audio: ArrayBuffer | Buffer;
  mimeType: string;
  locale?: string;
  /** Already resolved by the caller (the STT route needs it for its 503). */
  route?: VoiceRoute | null;
}): Promise<string | null> {
  const route = params.route === undefined ? await resolveVoiceRoute("stt") : params.route;
  if (!route) return null;

  const locale = params.locale || "hi-IN";
  const bytes = Buffer.isBuffer(params.audio) ? params.audio : Buffer.from(new Uint8Array(params.audio));
  const mimeType = params.mimeType.split(";")[0]!.trim().toLowerCase() || "audio/wav";

  try {
    if (route.provider === "GEMINI") {
      return await geminiTranscribe({
        apiKey: route.apiKey,
        model: GEMINI_STT_MODEL,
        audio: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        mimeType,
        locale,
      });
    }

    const upstreamForm = new FormData();
    upstreamForm.append("model", "saaras:v3");
    upstreamForm.append("mode", "transcribe");
    upstreamForm.append("language_code", toSarvamLanguageCode(locale));
    upstreamForm.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), `clip.${extensionFor(mimeType)}`);

    // Sync REST endpoint — caps at ~30s of audio. Every clip that reaches a
    // stranger is 10s by product rule, so the cap is never the reason this fails.
    const upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": route.apiKey },
      body: upstreamForm,
    });
    if (!upstream.ok) {
      console.error("[speech:transcribe] sarvam failed:", upstream.status, await upstream.text().catch(() => ""));
      return null;
    }
    const data = (await upstream.json()) as { transcript?: string };
    return (data.transcript ?? "").trim();
  } catch (err) {
    console.error("[speech:transcribe] request failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}
