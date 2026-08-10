import { NextResponse } from "next/server";
import { toSarvamLanguageCode } from "@/lib/speech/sarvamLocale";
import { resolveVoiceRoute } from "@/lib/speech/voiceConfig";
import { geminiTranscribe } from "@/lib/speech/geminiSpeech";
import { GEMINI_STT_MODEL } from "@/lib/speech/voiceCatalog";

export const runtime = "nodejs";

/**
 * One transcript endpoint, two vendors behind it.
 *
 * The client (`SarvamSpeechProvider`) is not told which one answered and must
 * never learn: it uploads a WAV and reads back a transcript, exactly as before
 * Gemini existed. Everything vendor-shaped — which key, which model, which
 * voice — is resolved here from the admin's setting.
 */
export async function POST(req: Request) {
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

  try {
    if (route.provider === "GEMINI") {
      const transcript = await geminiTranscribe({
        apiKey: route.apiKey,
        model: GEMINI_STT_MODEL,
        audio: await file.arrayBuffer(),
        // `toWav16kMono` on the client guarantees this regardless of what the
        // browser's MediaRecorder produced, so it is a fact rather than a guess.
        mimeType: "audio/wav",
        locale,
      });
      if (transcript === null) {
        return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
      }
      // Gemini has no language-detection field to report back, so the request's
      // own locale is echoed. The caller only uses this for display.
      return NextResponse.json({ ok: true, transcript, languageCode: locale });
    }

    const upstreamForm = new FormData();
    upstreamForm.append("model", "saaras:v3");
    upstreamForm.append("mode", "transcribe");
    upstreamForm.append("language_code", toSarvamLanguageCode(locale));
    upstreamForm.append("file", file, "answer.wav");

    // Sync REST endpoint — caps at ~30s of audio, which a couple of spoken
    // answers per turn never approaches. A recording that does run over just
    // comes back as an upstream error, same as any other network failure —
    // the caller (SarvamSpeechProvider) already falls back to typing on that.
    const upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": route.apiKey },
      body: upstreamForm,
    });

    if (!upstream.ok) {
      console.error("[speech:stt] sarvam failed:", upstream.status, await upstream.text().catch(() => ""));
      return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
    }

    const data = (await upstream.json()) as { transcript?: string; language_code?: string };
    return NextResponse.json({
      ok: true,
      transcript: (data.transcript ?? "").trim(),
      languageCode: data.language_code ?? locale,
    });
  } catch (err) {
    console.error("[speech:stt] request failed:", err);
    return NextResponse.json({ ok: false, message: "upstream_error" }, { status: 502 });
  }
}
