import { NextResponse } from "next/server";
import { toSarvamLanguageCode } from "@/lib/speech/sarvamLocale";
import { resolveVoiceRoute } from "@/lib/speech/voiceConfig";
import { geminiSynthesize } from "@/lib/speech/geminiSpeech";
import { GEMINI_TTS_MODEL, isSarvamVoice } from "@/lib/speech/voiceCatalog";

export const runtime = "nodejs";

/**
 * One audio endpoint, two vendors behind it — the mirror of `/api/speech/stt`.
 *
 * Always answers `audio/wav`, whoever spoke. Sarvam returns a WAV already;
 * Gemini returns headerless PCM that `geminiSynthesize` wraps before it leaves
 * the server. That single content type is what lets
 * `SarvamSpeechOutputProvider` stay vendor-blind — it builds one `Audio`
 * element and never asks who is talking.
 */
export async function POST(req: Request) {
  const route = await resolveVoiceRoute("tts");
  if (!route) {
    return NextResponse.json({ ok: false, message: "not_configured" }, { status: 503 });
  }

  let body: { text?: string; locale?: string; speaker?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "bad_request" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ ok: false, message: "bad_request" }, { status: 400 });
  }
  // Sarvam's REST endpoint tops out at 2500 characters. Applied to both vendors
  // rather than only the one that enforces it, so switching provider can never
  // change what the app accepts — a request that works today must not start
  // failing because an admin changed a dropdown.
  if (text.length > 2500) {
    return NextResponse.json({ ok: false, message: "too_long" }, { status: 400 });
  }

  try {
    if (route.provider === "GEMINI") {
      const wav = await geminiSynthesize({
        apiKey: route.apiKey,
        model: GEMINI_TTS_MODEL,
        text,
        voice: route.voice,
      });
      if (!wav) return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
      return new NextResponse(wav, {
        headers: { "content-type": "audio/wav", "cache-control": "no-store" },
      });
    }

    const upstream = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": route.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: toSarvamLanguageCode(body.locale ?? "hi-IN"),
        // A per-request speaker still wins when it names a real voice — the
        // admin setting is the default, not a lock. Anything else falls back
        // to the configured voice rather than becoming a paid call Sarvam
        // rejects for an invalid speaker.
        speaker: body.speaker && isSarvamVoice(body.speaker) ? body.speaker : route.voice,
        model: "bulbul:v3",
        speech_sample_rate: 24000,
      }),
    });

    if (!upstream.ok) {
      console.error("[speech:tts] sarvam failed:", upstream.status, await upstream.text().catch(() => ""));
      return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
    }

    const data = (await upstream.json()) as { audios?: string[] };
    const audioBase64 = data.audios?.[0];
    if (!audioBase64) {
      return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
    }

    return new NextResponse(Buffer.from(audioBase64, "base64"), {
      headers: { "content-type": "audio/wav", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[speech:tts] request failed:", err);
    return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
  }
}
