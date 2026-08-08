import { NextResponse } from "next/server";
import { toSarvamLanguageCode } from "@/lib/speech/sarvamLocale";
import { getProviderKey } from "@/lib/ai/credentials";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const key = await getProviderKey("SARVAM");
  if (!key) {
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

  const upstreamForm = new FormData();
  upstreamForm.append("model", "saaras:v3");
  upstreamForm.append("mode", "transcribe");
  upstreamForm.append("language_code", toSarvamLanguageCode(locale));
  upstreamForm.append("file", file, "answer.wav");

  try {
    // Sync REST endpoint — caps at ~30s of audio, which a couple of spoken
    // answers per turn never approaches. A recording that does run over just
    // comes back as an upstream error, same as any other network failure —
    // the caller (SarvamSpeechProvider) already falls back to typing on that.
    const upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": key },
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
